import { Router } from 'express';
import neo4j from 'neo4j-driver';
import format from 'string-format';
import { v4 as uuidv4 } from 'uuid';

import { normalize } from '../../../../lib/phone';
import { ValidationError } from '../../../../lib/errors';
import ambassadorsSvc from '../../../../services/ambassadors';
import { error } from '../../../../services/errors';

import {
  _204, _400, _401, _403, _404, geoCode
} from '../../../../lib/utils';

import {
  validateEmpty, validatePhone, validateEmail
} from '../../../../lib/validations';

import mail from '../../../../lib/mail';

import { serializeAmbassador, serializeAmbassadorForAdmin, serializeTripler, serializePayout, serializeName } from './serializers';
import sms from '../../../../lib/sms';
import { ov_config } from '../../../../lib/ov_config';
import caller_id from '../../../../lib/caller_id';
import reverse_phone from '../../../../lib/reverse_phone';
import carrier from '../../../../lib/carrier';

async function createAmbassador(req, res) {
  let new_ambassador = null;
  try {
    if (!validateEmpty(req.body, ['first_name', 'phone', 'address'])) {
      return error(400, res, "Invalid payload, ambassador cannot be created");
    }

    if (!validatePhone(req.body.phone)) {
      return error(400, res, "Our system doesn’t recognize that phone number. Please try again.");
    }

    if (req.models.Ambassador.phone.unique) {
      let existing_ambassador = await req.neode.first('Ambassador', 'phone', normalize(req.body.phone));
      if(existing_ambassador) {
        return error(400, res, "That phone number is already in use. Cannot create ambassador.");
      }
    }

    if (req.body.email) {
      if (!validateEmail(req.body.email)) return error(400, res, "Invalid email");  

      if (req.models.Ambassador.email.unique && 
          await req.neode.first('Ambassador', 'email', req.body.email)) {
        return error(400, res, "That email address is already in use. Cannot create ambassador.");
      }
    }

    let coordinates = await geoCode(req.body.address);
    if (coordinates === null) {
      return error(400, res, "Our system doesn’t recognize that address. Please try again.");
    }

    new_ambassador = await req.neode.create('Ambassador', {
      id: uuidv4(),
      first_name: req.body.first_name,
      last_name: req.body.last_name || null,
      phone: normalize(req.body.phone),
      email: req.body.email || null,
      address: JSON.stringify(req.body.address, null, 2),
      quiz_results: JSON.stringify(req.body.quiz_results, null, 2) || null,
      approved: false,
      locked: false,
      signup_completed: false,
      onboarding_completed: false,
      location: {
        latitude: parseFloat(coordinates.latitude, 10),
        longitude: parseFloat(coordinates.longitude, 10)
      }
    })
  } catch(err) {
    req.logger.error("Unhandled error in %s: %s", req.url, err);
    return error(500, res, 'Unable to create ambassador');
  }
  return res.json(serializeAmbassador(new_ambassador));
}

async function countAmbassadors(req, res) {
  let count = await req.neode.query()
    .match('a', 'Ambassador')
    .return('count(a) as count')
    .execute()

  return res.json({ count: count.records[0]._fields[0].low });
}

async function fetchAmbassadors(req, res) {
  let query = {};
  
  if (req.query.phone) query.phone = normalize(req.query.phone);
  if (req.query.email) query.email = req.query.email;
  if (req.query['external-id']) query.external_id = req.query['external-id'];
  if (req.query.approved) query.approved = req.query.approved.toLowerCase() === 'true';  
  if (req.query.locked) query.locked = req.query.locked.toLowerCase() === 'true';
  if (req.query['signup-completed']) query.signup_completed = req.query['signup-completed'] === 'true';
  if (req.query['onboarding-completed']) query.onboarding_completed = req.query['onboarding-completed'] === 'true';

  const collection = await req.neode.model('Ambassador').all(query);
  let models = [];
  for (var index = 0; index < collection.length; index++) {
    let entry = collection.get(index);
    models.push(serializeAmbassador(entry))
  }
  return res.json(models);
}

async function fetchAmbassador(req, res) {
  let ambassador = await req.neode.first('Ambassador', 'id', req.params.ambassadorId);
  if (ambassador) {
    return res.json(serializeAmbassadorForAdmin(ambassador));
  }
  else {
    return _404(res, "Ambassador not found");
  }
}

async function fetchCurrentAmbassador(req, res) {
  if (!req.user.get) return _404(res, "No current ambassador");
  return res.json(serializeAmbassador(req.user));
}

async function approveAmbassador(req, res) {
  let found = null;
  found = await req.neode.first('Ambassador', 'id', req.params.ambassadorId);

  if (!found) {
    return error(404 ,res, "Ambassador not found");
  }

  if (!found.get('onboarding_completed')) {
    return error(400, res, "Onboarding not completed for the user yet");
  }

  let json = {...{approved: true, locked: false}};
  let updated = await found.update(json);

  try {
   await sms(found.get('phone'), format(ov_config.ambassador_approved_message,
                                    {
                                      ambassador_first_name: found.get('first_name'),
                                      ambassador_last_name: found.get('last_name') || '',
                                      ambassador_city: JSON.parse(found.get('address')).city,
                                      organization_name: ov_config.organization_name,
                                      ambassador_landing_page: ov_config.ambassador_landing_page
                                    }));
  } catch (err) {
    req.logger.error("Unhandled error in %s: %s", req.url, err);
    return error(500, res, 'Error sending approved sms to the ambassador');
  }

  return _204(res);
}

async function disapproveAmbassador(req, res) {
  let found = null;
  found = await req.neode.first('Ambassador', 'id', req.params.ambassadorId);

  if (!found) {
    return error(404, res, "Ambassador not found");
  }

  let json = {...{approved: false, locked: true}};
  let updated = await found.update(json);
  return _204(res);
}

async function makeAdmin(req, res) {
  let found = null;
  found = await req.neode.first('Ambassador', 'id', req.params.ambassadorId);

  if (!found) {
    return error(404, res, "Ambassador not found");
  }

  let json = {...{admin: true}};
  await found.update(json);

  // send email in the background
  setTimeout(async ()=> {
    let address = JSON.parse(found.get('address'));
    let body = `
    Organization Name:
    <br>
    ${ov_config.organization_name}
    <br>
    <br>
    Google/FB ID:
    <br>
    ${found.get('external_id')}
    <br>
    <br>
    First Name:
    <br>
    ${found.get('first_name')}
    <br>
    <br>
    Last Name:
    <br>
    ${found.get('last_name')}
    <br>
    <br>
    Date of Birth:
    <br>
    ${found.get('date_of_birth')}
    <br>
    <br>
    Street Address:
    <br>
    ${address.address1}
    <br>
    <br>
    Zip:
    <br>
    ${address.zip}
    <br>
    <br>
    Email:
    <br>
    ${found.get('email')}
    <br>
    <br>
    Phone Number:
    <br>
    ${found.get('phone')}
    <br>
    <br>
    `;

    let subject = `New Admin for ${ov_config.organization_name}`;
    await mail(ov_config.admin_emails, null, null, subject, body);
  }, 100);

  return _204(res);
}

async function signup(req, res) {
  req.body.externalId = req.externalId;
  let new_ambassador = null;

  //check carrier lookup for blocked carriers
  let carrierLookup = await carrier(normalize(req.body.phone));
  if(carrierLookup.carrier.isBlocked) {
    return error(400, res, `We're sorry, due to fraud concerns '${carrierLookup.carrier.name}' phone numbers are not permitted. Please try again.`, { request: req.body });
  }

  // check against Twilio caller ID and Ekata data
  let twilioCallerId = await caller_id(req.body.phone);
  let ekataReversePhone = await reverse_phone(req.body.phone);
  let verification = [];

  if (twilioCallerId) {
    try {
      verification.push({
        source: 'Twilio',
        name: twilioCallerId
      })
    } catch (err) {
      logger.error("Could not get verification info for ambassador: %s", err);
    }
  }
  if (ekataReversePhone) {
    try {
      verification.push({
        source: 'Ekata',
        name: ekataReversePhone.addOns.results.ekata_reverse_phone
      })
    } catch (err) {
      logger.error("Could not get verification info for ambassador: %s", err);
    }
  }

  try {
    new_ambassador = await ambassadorsSvc.signup(req.body, verification, carrierLookup);
  }
  catch (err) {
    if (err instanceof ValidationError) {
      return error(400, res, err.message, req.body);
    } else {
      req.logger.error("Unhandled error in %s: %s", req.url, err);
      return error(500, res, 'Unable to update ambassador form data', { ambassador: req.body, verification: verification });
    }
  }

  try {
   await sms(new_ambassador.get('phone'), format(ov_config.ambassador_signup_message,
                                    {
                                      ambassador_first_name: new_ambassador.get('first_name'),
                                      ambassador_last_name: new_ambassador.get('last_name') || '',
                                      ambassador_city: JSON.parse(new_ambassador.get('address')).city,
                                      organization_name: ov_config.organization_name,
                                      ambassador_landing_page: ov_config.ambassador_landing_page
                                    }));
  } catch (err) {
    req.logger.error("Unhandled error in %s: %s", req.url, err);
    req.logger.error("Error sending signup sms to the ambassador");
  }

  return res.json(serializeAmbassador(new_ambassador));
}

async function updateAmbassador(req, res) {
  let found = await req.neode.first('Ambassador', 'id', req.params.ambassadorId);
  if (!found) {
    return error(404, res, "Ambassador not found");
  }

  if (req.body.phone) {
    if (!validatePhone(req.body.phone)) {
      return error(400, res, "Our system doesn’t recognize that phone number. Please try again.");
    }

    if (req.models.Ambassador.phone.unique) {
      let existing_ambassador = await req.neode.first('Ambassador', 'phone', normalize(req.body.phone));
      if(existing_ambassador && existing_ambassador.get('id') !== found.get('id')) {
        return error(400, res, "That phone number is already in use. Cannot update ambassador.");
      }
    }
  }

  if (req.body.email) {
    if (!validateEmail(req.body.email)) return error(400, res, "Invalid email");  

    if (req.models.Ambassador.email.unique) {
      let existing_ambassador = await req.neode.first('Ambassador', 'email', req.body.email);
      if(existing_ambassador && existing_ambassador.get('id') !== found.get('id')) {
        return error(400, res, "That email address is already in use. Cannot update ambassador.");
      }
    }
  }

  let whitelistedAttrs = ['first_name', 'last_name', 'date_of_birth', 'email'];

  let json = {};
  for (let prop in req.body) {
    if (whitelistedAttrs.indexOf(prop) !== -1) {
      json[prop] = req.body[prop];
    }
  }

  if (req.body.phone) {
    json.phone = normalize(req.body.phone);
  }

  if (req.body.address) {
    let coordinates = await geoCode(req.body.address);
    if (coordinates === null) {
      return error(400, res, "Invalid address, ambassador cannot be updated");
    }
    json.address = JSON.stringify(req.body.address, null, 2);
    json.location = new neo4j.types.Point(4326, // WGS 84 2D
                                           parseFloat(coordinates.longitude, 10),
                                           parseFloat(coordinates.latitude, 10));
  }

  if (req.body.quiz_results) {
    json.quiz_results = JSON.stringify(res.body.quiz_results, null, 2);
  }
  let updated = await found.update(json);
  return res.json(serializeAmbassador(updated));
}

async function updateCurrentAmbassador(req, res) {
  let found = req.user;

  if (req.body.phone) {
    if (!validatePhone(req.body.phone)) {
      return error(400, res, "Our system doesn’t recognize that phone number. Please try again.");
    }

    if (req.models.Ambassador.phone.unique) {
      let existing_ambassador = await req.neode.first('Ambassador', 'phone', normalize(req.body.phone));
      if(existing_ambassador && existing_ambassador.get('id') !== found.get('id')) {
        return error(400, res, "That phone number is already in use. Cannot update current ambassador.");
      }
    }
  }

  if (req.body.email) {
    if (!validateEmail(req.body.email)) return error(400, res, "Invalid email");  

    if (req.models.Ambassador.email.unique) {
      let existing_ambassador = await req.neode.first('Ambassador', 'email', req.body.email);
      if(existing_ambassador && existing_ambassador.get('id') !== found.get('id')) {
        return error(400, res, "That email address is already in use. Cannot update current ambassador.");
      }
    }
  }

  let whitelistedAttrs = ['first_name', 'last_name', 'date_of_birth', 'email'];

  let json = {};
  for (let prop in req.body) {
    if (whitelistedAttrs.indexOf(prop) !== -1) {
      json[prop] = req.body[prop];
    }
  }

  if (req.body.phone) {
    json.phone = normalize(req.body.phone);
  }

  if (req.body.address) {
    let coordinates = await geoCode(req.body.address);
    if (coordinates === null) {
      return error(400, res, "Invalid address, ambassador cannot be updated");
    }
    json.address = JSON.stringify(req.body.address, null, 2);
    json.location = new neo4j.types.Point(4326, // WGS 84 2D
                                           parseFloat(coordinates.longitude, 10),
                                           parseFloat(coordinates.latitude, 10));
  }

  if (req.body.quiz_results) {
    json.quiz_results = JSON.stringify(req.body.quiz_results, null, 2);
  }
  let updated = await found.update(json);
  return res.json(serializeAmbassador(updated));
}

async function deleteAmbassador(req, res) {
  let found = await req.neode.first('Ambassador', 'id', req.params.ambassadorId);
  if (!found) {
    return error(404, res, "Ambassador not found");
  }

  if (req.user.get('id') === req.params.ambassadorId) {
    return error(400, res, "Cannot delete self");
  }

  found.delete();

  return _204(res);
}

async function claimTriplers(req, res) {
  let ambassador = req.user;

  if (!req.body.triplers || req.body.triplers.length === 0) {
    return error(400, res, 'Invalid request, empty list of triplers');
  }

  // The triplers specified by this ambassador
  let requested_triplers = [];
  let all_triplers = [];
  for (let entry of req.body.triplers) {
    let model = await req.neode.first('Tripler', 'id', entry);
    if (!model) {
      return error(404, res, 'Tripler not found, invalid id');
    }
    requested_triplers.push(model);
    all_triplers.push(model);
  }

  // Add all existing triplers
  let current_claims_num = 0;
  ambassador.get('claims').forEach((entry) => {
    all_triplers.push(entry.otherNode());
    current_claims_num++;
  });
  all_triplers = [... new Set(all_triplers)]; // eliminate duplicates
  if (all_triplers.length > parseInt(ov_config.claim_tripler_limit)) {
    return _400(res, `You may select up to ${ov_config.claim_tripler_limit} possible Vote Triplers. Please select up to ${ov_config.claim_tripler_limit - current_claims_num} more to continue.`);
  }

  for(let entry of requested_triplers) {
    await ambassador.relateTo(entry, 'claims');
  }

  return _204(res);
}

async function unclaimTriplers(req, res) {

  if (!req.body.triplers || req.body.triplers.length === 0) {
    return error(400, res, 'Invalid request, empty list of triplers');
  }

  await ambassadorsSvc.unclaimTriplers(req);

  return _204(res);
}

async function completeOnboarding(req, res) {
  let found = req.user;
  if (!found.get('signup_completed')) {
    return error(400, res, "Signup not completed for user yet");
  }

  let updated = await found.update({
    onboarding_completed: true,
    quiz_results: req.body.quiz_results ? JSON.stringify(req.body.quiz_results, null, 2) : req.body ? JSON.stringify(req.body, null, 2) : null,
  });
  return res.json(serializeAmbassador(updated));
}

async function ambassadorPayouts(ambassador, neode) {
  let payouts = [];

  if (!ambassador.get('gets_paid') || ambassador.get('gets_paid').length === 0) 
    return payouts;

  await Promise.all(ambassador.get('gets_paid').map(async (entry) => {
    let payout = entry.otherNode();
    let obj = serializePayout(payout);
    let tripler = await neode.first('Tripler', 'id', entry.get('tripler_id'));
    if (tripler.get) {
      obj.tripler_name = serializeName(tripler.get('first_name'), tripler.get('last_name'));
    } else {
      obj.tripler_name = 'Tripler not found';
    }
    payouts.push(obj);
  }));

  return payouts;
}

async function fetchCurrentAmbassadorPayouts(req, res) {
  return res.json(await ambassadorPayouts(req.user, req.neode));
}

async function fetchAmbassadorPayouts(req, res) {
  let ambassador = await req.neode.first('Ambassador', 'id', req.params.ambassadorId);
  if (ambassador) {
    return res.json(await ambassadorPayouts(ambassador, req.neode));
  }
  else {
    return error(404, res, "Ambassador not found");
  }
}

function claimedTriplers(req, res) {
  let ambassador = req.user;

  let triplers = {};
  ambassador.get('claims').forEach((entry) => triplers[entry.otherNode().get('id')] = serializeTripler(entry.otherNode()));

  return res.json(Object.values(triplers));
}

function checkAmbassador(req, res) {
  return res.json( { exists: !!req.user.get } );
}

async function callerInfo(req, res) {
  let ambassador = await req.neode.first('Ambassador', 'id', req.params.ambassadorId);
  let callerId = await caller_id(ambassador.get('phone'));
  let reversePhone = await reverse_phone(ambassador.get('phone'));
  return res.json({ twilio: callerId, ekata: reversePhone });
}

module.exports = Router({mergeParams: true})
.post('/ambassadors/signup', (req, res) => {
  return signup(req, res);
})
.get('/ambassadors/current', (req, res) => {
  if (Object.keys(req.user).length === 0 && req.user.constructor === Object) {
    return fetchCurrentAmbassador(req, res);
  }
  if (!req.authenticated) return _401(res, 'Permission denied.')
  return fetchCurrentAmbassador(req, res);
})
.put('/ambassadors/current', (req, res) => {
  if (!req.authenticated) return _401(res, 'Permission denied.')
  return updateCurrentAmbassador(req, res);
})
.put('/ambassadors/current/triplers', (req, res) => {
  if (!req.authenticated) return _401(res, 'Permission denied.')
  return claimTriplers(req, res);
})
.delete('/ambassadors/current/triplers', (req, res) => {
  if (!req.authenticated) return _401(res, 'Permission denied.')
  return unclaimTriplers(req, res);
})
.get('/ambassadors/current/triplers', (req, res) => {
  if (!req.authenticated) return _401(res, 'Permission denied.')
  return claimedTriplers(req, res);
})
.get('/ambassadors/exists', (req, res) => {
  return checkAmbassador(req, res);
})
.put('/ambassadors/current/complete-onboarding', (req, res) => {
  if (!req.authenticated) return _401(res, 'Permission denied.')
  return completeOnboarding(req, res);
})
.get('/ambassadors/current/payouts', (req, res) => {
  if (!req.authenticated) return _401(res, 'Permission denied.')
  return fetchCurrentAmbassadorPayouts(req, res);
})

.post('/ambassadors', (req, res) => {
  if (!req.authenticated) return _401(res, 'Permission denied.')
  if (!req.admin) return _403(res, "Permission denied.");
  return createAmbassador(req, res);
})
.get('/ambassadors', (req, res) => {
  if (!req.authenticated) return _401(res, 'Permission denied.')
  if (!req.admin) return _403(res, "Permission denied.");
  return fetchAmbassadors(req, res);
})
.get('/ambassadors/count', (req, res) => {
  if (!req.authenticated) return _401(res, 'Permission denied.')
  if (!req.admin) return _403(res, "Permission denied.");
  return countAmbassadors(req, res);
})
.get('/ambassadors/:ambassadorId', (req, res) => {
  if (!req.authenticated) return _401(res, 'Permission denied.')
  if (!req.admin) return _403(res, "Permission denied.");
  return fetchAmbassador(req, res);
})
.put('/ambassadors/:ambassadorId/approve', (req, res) => {
  if (!req.authenticated) return _401(res, 'Permission denied.')
  if (!req.admin) return _403(res, "Permission denied.");
  return approveAmbassador(req, res);
})
.put('/ambassadors/:ambassadorId/disapprove', (req, res) => {
  if (!req.authenticated) return _401(res, 'Permission denied.')
  if (!req.admin) return _403(res, "Permission denied.");
  return disapproveAmbassador(req, res);
})
.put('/ambassadors/:ambassadorId/admin', (req, res) => {
  if (ov_config.DEBUG) return makeAdmin(req, res);
  if (!req.authenticated) return _401(res, 'Permission denied.')
  if (!req.admin) return _403(res, "Permission denied.");
  if (!ov_config.make_admin_api) return _403(res, 'Permission denied.');
  return makeAdmin(req, res);
})
.put('/ambassadors/:ambassadorId', (req, res) => {
  if (!req.authenticated) return _401(res, 'Permission denied.')
  if (!req.admin) return _403(res, "Permission denied.");
  return updateAmbassador(req, res);
})
.delete('/ambassadors/:ambassadorId', (req, res) => {
  if (!req.authenticated) return _401(res, 'Permission denied.')
  if (!req.admin) return _403(res, "Permission denied.");
  return deleteAmbassador(req, res);
})
.get('/ambassadors/:ambassadorId/payouts', (req, res) => {
  if (!req.authenticated) return _401(res, 'Permission denied.')
  if (!req.admin) return _403(res, "Permission denied.");
  return fetchAmbassadorPayouts(req, res);
})
.get('/ambassadors/:ambassadorId/caller-info', (req, res) => {
  if (!req.authenticated) return _401(res, 'Permission denied.')
  if (!req.admin) return _403(res, "Permission denied.");
  return callerInfo(req, res);
})
