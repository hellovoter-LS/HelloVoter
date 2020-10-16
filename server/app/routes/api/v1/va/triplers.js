import { Router } from 'express';
import neo4j from 'neo4j-driver';
import stringFormat from 'string-format';
import { v4 as uuidv4 } from 'uuid';

import { normalize } from '../../../../lib/phone';
import { ov_config } from '../../../../lib/ov_config';
import triplersSvc from '../../../../services/triplers';
import { error } from '../../../../services/errors';

import {
  _204, _401, _403, geoCode
} from '../../../../lib/utils';

import {
  validateEmpty, validatePhone, validateEmail
} from '../../../../lib/validations';

import { serializeTripler, serializeNeo4JTripler, serializeTriplee } from './serializers';

import sms from '../../../../lib/sms';
import carrier from '../../../../lib/carrier';

async function createTripler(req, res) {
  let new_tripler = null

  try {
    if (!validateEmpty(req.body, ['first_name', 'phone', 'address'])) {
      return error(400, res, "Invalid payload, tripler cannot be created");
    }

    if (!validatePhone(req.body.phone)) {
      return error(400, res, "Our system doesn’t recognize that phone number. Please try again.");
    }

    if (req.models.Tripler.phone.unique) {
      if (await req.neode.first('Tripler', 'phone', normalize(req.body.phone))) {
        return error(400, res, "That phone number is already in use.");
      }
    }

    if (req.body.email) {
      if (!validateEmail(req.body.email)) return _400(res, "Invalid email");

      if (req.models.Tripler.email.unique) {
        let existing_tripler = await req.neode.first('Tripler', 'email', req.body.email);
        if(existing_tripler) {
          return error(400, res, "Tripler with this email already exists");
        }
      }
    }

    let coordinates = await geoCode(req.body.address);
    if (coordinates === null) {
      return error(400, res, "Invalid address, tripler cannot be created");
    }

    const obj = {
      id: uuidv4(),
      first_name: req.body.first_name,
      last_name: req.body.last_name || null,
      phone: normalize(req.body.phone),
      email: req.body.email || null,
      address: JSON.stringify(req.body.address),
      triplees: !req.body.triplees ? null : JSON.stringify(req.body.triplees),
      location: {
        latitude: parseFloat(coordinates.latitude, 10),
        longitude: parseFloat(coordinates.longitude, 10)
      },
      status: 'unconfirmed'
    }

    new_tripler = await req.neode.create('Tripler', obj);
  } catch(err) {
    req.logger.error("Unhandled error in %s: %s", req.url, err);
    return error(500, res, 'Unable to create tripler');
  }
  return res.json(serializeTripler(new_tripler));
}

//
// adminSearchTriplers
//
// useful for QA purposes
//
async function adminSearchTriplers(req, res) {
  let models = await triplersSvc.adminSearchTriplers(req)
  return res.json(models);
}

//
// searchTriplersAmbassador
//
// search triplers as an ambassador
//
async function searchTriplersAmbassador(req, res) {
  if (!req.query.firstName && !req.query.lastName) {
    return res.json([]);
  }
  let models = await triplersSvc.searchTriplersAmbassador(req.query)
  return res.json(models);
}

//
// searchTriplersAdmin
//
// search triplers as an admin
//
async function searchTriplersAdmin(req, res) {
  if (!req.query.firstName && !req.query.lastName) {
    return res.json([]);
  }
  let models = await triplersSvc.searchTriplersAdmin(req.query)
  return res.json(models);
}

//
// suggestTriplers
//
// provide a list of potential triplers for an ambassador to select from
//
async function suggestTriplers(req, res) {
  let collection = await req.neode.query()
    .match('a', 'Ambassador')
    .where('a.id', req.user.get('id'))
    .match('t', 'Tripler')
    .whereRaw('NOT ()-[:CLAIMS]->(t)')
    .whereRaw('NOT ()-[:WAS_ONCE]->(t)')
    .whereRaw(`distance(t.location, a.location) <= ${ov_config.ambassador_tripler_relation_max_distance}`) // distance in meters (10km)
    .with('a, t, distance(t.location, a.location) AS distance')
    .orderBy('distance')
    .return('t, distance')
    .limit(ov_config.suggest_tripler_limit)
    .execute()

  let models = [];
  for (var index = 0; index < collection.records.length; index++) {
    let entry = collection.records[index]._fields[0].properties;
    entry['distance'] = collection.records[index]._fields[1];
    models.push(serializeNeo4JTripler(entry));
  }
  return res.json(models);
}

async function fetchTripler(req, res) {
  let ambassador = req.user;
  let tripler = null;
  ambassador.get('claims').forEach((entry) => { if (entry.otherNode().get('id') === req.params.triplerId) { tripler = entry.otherNode() } } );

  if (!tripler) {
    return error(400, res, "Invalid triper id");
  }
  return res.json(serializeTripler(tripler));
}

async function updateTripler(req, res) {
  let found = null;
  found = await req.neode.first('Tripler', 'id', req.params.triplerId);
  if (!found) return error(404, res, "Tripler not found");

  if (req.body.phone) {
    if (!validatePhone(req.body.phone)) {
      return error(400, res, "Our system doesn’t recognize that phone number. Please try again.");
    }

    let existing_tripler = await req.neode.first('Tripler', 'phone', normalize(req.body.phone));
    if(existing_tripler && existing_tripler.get('id') !== found.get('id')) {
      return error(400, res, "That phone number is already in use.");
    }
  }

  if (req.body.email) {
    if (!validateEmail(req.body.email)) return _400(res, "Invalid email");

    if (req.models.Tripler.email.unique) {
      let existing_tripler = await req.neode.first('Tripler', 'email', req.body.email);
      if(existing_tripler && existing_tripler.get('id') !== found.get('id')) {
        return error(400, res, "Tripler with this email already exists");
      }
    }
  }

  let whitelistedAttrs = ['first_name', 'last_name', 'date_of_birth', 'email', 'status'];

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
      return error(400, res, "Invalid address, tripler cannot be updated");
    }
    json.address = JSON.stringify(req.body.address);
    json.location = new neo4j.types.Point(4326, // WGS 84 2D
                                           parseFloat(coordinates.longitude, 10),
                                           parseFloat(coordinates.latitude, 10));
  }

  if (req.body.triplees) {
    json.triplees = JSON.stringify(req.body.triplees);
  }

  let updated = await found.update(json);
  return res.json(serializeTripler(updated));
}

async function startTriplerConfirmation(req, res) {
  let ambassador = req.user;
  let tripler = null;
  ambassador.get('claims').forEach((entry) => { if (entry.otherNode().get('id') === req.params.triplerId) { tripler = entry.otherNode() } } );

  if (!tripler) {
    return error(400, res, "Invalid triper id");
  }
  else if (tripler.get('status') !== 'unconfirmed') {
    return error(400, res, "Invalid status, cannot proceed")
  }

  let triplees = req.body.triplees;
  let tripler_birthdate_mm_yy = req.body.tripler_birthdate_mm_yy

  //if !birthdate tell system to add birthdate
  if (!triplees || triplees.length !== 3) {
    return error(400, res, 'Insufficient triplees, cannot start confirmation')
  }
if (!tripler_birthdate_mm_yy ||tripler_birthdate_mm_yy.length <4 ) {
    return error(400, res, 'Please add birthdate, cannot start confirmation')
  }

  // make a bdate cheker below similar to req.body.phone checker, validate and make sure it's the right format + #s [do it after golden path working]

    //code up a birthdate checker function inside tripler services that returns true if the bdate is valid, false if it doesn't (see findAmbassadorsWithPendingDisbursements in ambassador services)

    // if true pass through || if false 

  if (req.body.phone) {
    if (!validatePhone(req.body.phone)) {
      return error(400, res, "Our system doesn’t recognize that phone number. Please try again.");
    }

    let existing_tripler = await req.neode.first('Tripler', 'phone', normalize(req.body.phone));
    if(existing_tripler && existing_tripler.get('id') !== tripler.get('id')) {
      return error(400, res, "That phone number is already in use.");
    }
  }

  let triplerPhone = req.body.phone ? normalize(req.body.phone): tripler.get('phone');

  if (triplerPhone === ambassador.get('phone')) {
    return error(400, res, "You entered your phone number as the number of this Vote Tripler. Please try again.");
  }

  let carrierLookup = await carrier(triplerPhone);
  if(carrierLookup.carrier.isBlocked) {
    await triplersSvc.updateTriplerCarrier(tripler, carrierLookup.carrier.name);
    return _400(res, `We're sorry, due to fraud concerns '${carrierLookup.carrier.name}' phone numbers are not permitted. Please try again.`);
  }

  try {
    triplersSvc.startTriplerConfirmation(ambassador, tripler, triplerPhone, triplees, tripler_birthdate_mm_yy);
  } catch (err) {
    req.logger.error("Unhandled error in %s: %s", req.url, err);
    return error(500, res, 'Error sending confirmation sms to the tripler');
  }

  return _204(res);
}

async function remindTripler(req, res) {
  let ambassador = req.user;
  let tripler = null;

  // TODO get ambassador directory from tripler, and then compare
  ambassador.get('claims').forEach((entry) => { if (entry.otherNode().get('id') === req.params.triplerId) { tripler = entry.otherNode() } } );

  if (!tripler) {
    return error(400, res, "Invalid triper id");
  }
  else if (tripler.get('status') !== 'pending') {
    return error(400, res, "Invalid status, cannot proceed")
  }

  let new_phone = req.body.phone;
  if (new_phone) {
    if (!validatePhone(req.body.phone)) {
      return error(400, res, "Our system doesn’t recognize that phone number. Please try again.");
    }

    await tripler.update({ phone: new_phone });
  }

  let triplees = JSON.parse(tripler.get('triplees'));

  try {
    await sms(tripler.get('phone'), stringFormat(ov_config.tripler_reminder_message,
                                    {
                                      ambassador_first_name: ambassador.get('first_name'),
                                      ambassador_last_name: ambassador.get('last_name') || '',
                                      organization_name: ov_config.organization_name,
                                      tripler_first_name: tripler.get('first_name'),
                                      tripler_city: JSON.parse(tripler.get('address')).city,
                                      triplee_1: serializeTriplee(triplees[0]),
                                      triplee_2: serializeTriplee(triplees[1]),
                                      triplee_3: serializeTriplee(triplees[2])
                                    }));
  } catch (err) {
    req.logger.error("Unhandled error in %s: %s", req.url, err);
    return error(500, res, 'Error sending reminder sms to the tripler');
  }

  return _204(res);
}

async function confirmTripler(req, res) {
  let tripler = await triplersSvc.findById(req.params.triplerId);

  if (!tripler) {
    return error(404, res, "Invalid tripler");
  }

  if (tripler.get('status') !== 'pending') {
    return error(400, res, "Invalid status, cannot confirm")
  }

  try {
    await triplersSvc.confirmTripler(req.params.triplerId);
  } catch(err) {
    req.logger.error("Unhandled error in %s: %s", req.url, err);
    return error(500, res, 'Error confirming a tripler');
  }
  return _204(res);
}

async function deleteTripler(req, res) {
  let tripler = await triplersSvc.findById(req.params.triplerId);

  if (!tripler) {
    return error(404, res, "Invalid tripler");
  }

  tripler.delete();
  return _204(res);
}

async function getTriplerLimit(req, res) {
  return res.json({limit: ov_config.claim_tripler_limit});
}

module.exports = Router({mergeParams: true})
.post('/triplers', (req, res) => {
  if (!req.authenticated) return _401(res, 'Permission denied.');
  if (!req.admin) return _403(res, "Permission denied.");;
  return createTripler(req, res);
})
.put('/triplers/:triplerId', (req, res) => {
  if (!req.authenticated) return _401(res, 'Permission denied.');
  if (!req.admin) return _403(res, "Permission denied.");;
  return updateTripler(req, res);
})
.put('/triplers/:triplerId/confirm', (req, res) => {
  if (!req.authenticated) return _401(res, 'Permission denied.');
  if (!req.admin) return _403(res, "Permission denied.");;
  return confirmTripler(req, res);
})
.delete('/triplers/:triplerId', (req, res) => {
  if (!req.authenticated) return _401(res, 'Permission denied.');
  if (!req.admin) return _403(res, "Permission denied.");;
  return deleteTripler(req, res);
})
.get('/admin/triplers', (req, res) => {
  if (!req.authenticated) return _401(res, 'Permission denied.');
  if (!req.admin) return _403(res, "Permission denied.");;
  return adminSearchTriplers(req, res);
})


.get('/triplers', (req, res) => {
  if (!req.authenticated) return _401(res, 'Permission denied.');
  if (req.admin) {
    return searchTriplersAdmin(req, res);
  } else {
    return searchTriplersAmbassador(req, res);
  }
})
.get('/suggest-triplers', (req, res) => {
  if (!req.authenticated) return _401(res, 'Permission denied.');
  return suggestTriplers(req, res);
})
.put('/triplers/:triplerId/start-confirm', (req, res) => {
  if (!req.authenticated) return _401(res, 'Permission denied.');
  return startTriplerConfirmation(req, res);
})
.put('/triplers/:triplerId/remind', (req, res) => {
  if (!req.authenticated) return _401(res, 'Permission denied.');
  return remindTripler(req, res);
})
.get('/triplers/:triplerId', (req, res) => {
  if (!req.authenticated) return _401(res, 'Permission denied.');
  return fetchTripler(req, res);
})
.get('/triplers-limit', (req, res) => {
  if (!req.authenticated) return _401(res, 'Permission denied.');
  return getTriplerLimit(req, res);
})
