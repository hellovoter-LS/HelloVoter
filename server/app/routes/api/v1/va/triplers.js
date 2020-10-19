import { Router } from 'express';
import stringFormat from 'string-format';
import { v4 as uuidv4 } from 'uuid';

import { normalizePhone } from '../../../../lib/normalizers';
import { ov_config } from '../../../../lib/ov_config';
import triplersSvc from '../../../../services/triplers';
import { error } from '../../../../services/errors';

import {
  _204, _401, _403, geoCode
} from '../../../../lib/utils';

import {
  validateEmpty, validatePhone, validateEmail, validateUniquePhone, validateUnique, verifyCallerIdAndReversePhone, validateCarrier
} from '../../../../lib/validations';

import { serializeAmbassador, serializeTripler, serializeNeo4JTripler, serializeTriplee } from './serializers';

import sms from '../../../../lib/sms';
import { getUserJsonFromRequest } from '../../../../lib/normalizers';

async function createTripler(req, res) {
  let new_tripler = null
  try {
    if (!validateEmpty(req.body, ['first_name', 'phone', 'address'])) {
      return error(400, res, "Invalid payload, tripler cannot be created");
    }

    if (!validatePhone(req.body.phone)) {
      return error(400, res, "Our system doesn't recognize that phone number. Cannot create tripler. Please try again.");
    }

    if (!await validateUniquePhone('Tripler', req.body.phone)) {
      return error(400, res, "That phone number is already in use.");
    }

    if (req.body.email) {
      if (!validateEmail(req.body.email)) {
        return error(400, res, "Invalid email");
      }

      if (!await validateUnique('Tripler', { email: req.body.email })) {
        return error(400, res, "Tripler with this email already exists.");
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
      phone: normalizePhone(req.body.phone),
      email: req.body.email || null,
      address: JSON.stringify(req.body.address, null, 2),
      triplees: !req.body.triplees ? null : JSON.stringify(req.body.triplees, null, 2),
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

// useful for QA purposes
async function adminSearchTriplers(req, res) {
  let models = await triplersSvc.adminSearchTriplers(req)
  return res.json(models);
}

async function searchTriplersAmbassador(req, res) {
  if (!req.query.firstName && !req.query.lastName) {
    return res.json([]);
  }
  let models = await triplersSvc.searchTriplersAmbassador(req)
  return res.json(models);
}

async function searchTriplersAdmin(req, res) {
  if (!req.query.firstName && !req.query.lastName) {
    return res.json([]);
  }
  let models = await triplersSvc.searchTriplersAdmin(req)
  return res.json(models);
}

// provide a list of potential triplers for an ambassador to select from
async function suggestTriplers(req, res) {
  let exclude_except = '';

  if (ov_config.exclude_unreg_except_in) {
    exclude_except += ov_config.exclude_unreg_except_in.split(",").map((state) => {
      return `AND NOT t.address CONTAINS '\"state\": \"${state}\"' `
    }).join(' ')
  }

  let collection = await req.neode.query()
    .match('a', 'Ambassador', {id: req.user.get('id')})
    .with('a, apoc.convert.fromJsonMap(a.address) as address')
    .with('a, toString(address.zip) as zip')
    .match('t', 'Tripler')
    .where('t.zip starts with left(zip,3)')
    .with('a,t')
    .whereRaw('NOT ()-[:CLAIMS]->(t)')
    .whereRaw('NOT ()-[:WAS_ONCE]->(t)')
    // .whereRaw(`NOT t.voter_id CONTAINS "Unreg" ${exclude_except}`)
    .with('a, t, distance(t.location, a.location) AS distance')
    .orderBy('distance')
    .return('t, distance')
    .limit(ov_config.suggest_tripler_limit)
    .execute()
/*
    .match('a', 'Ambassador')
    .where('a.id', req.user.get('id'))
    .match('t', 'Tripler')
    .whereRaw('NOT ()-[:CLAIMS]->(t)')
    .whereRaw('NOT ()-[:WAS_ONCE]->(t)')
    .whereRaw(`NOT t.voter_id CONTAINS "Unreg" ${exclude_except}`)
    .whereRaw(`distance(t.location, a.location) <= ${ov_config.ambassador_tripler_relation_max_distance}`) // distance in meters (see .env)
    .with('a, t, distance(t.location, a.location) AS distance')
    .orderBy('distance')
    .return('t, distance')
    .limit(ov_config.suggest_tripler_limit)
    .execute()
*/
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
  ambassador.get('claims').forEach((entry) => {
    if (entry.otherNode().get('id') === req.params.triplerId) {
      tripler = entry.otherNode();
    }
  });

  if (!tripler) {
    return error(400, res, "Invalid tripler id, could not fetch tripler.", { ambassador: serializeAmbassador(ambassador), triplerId: req.params.triplerId });
  }
  return res.json(serializeTripler(tripler));
}

async function updateTripler(req, res) {
  let found = await req.neode.first('Tripler', 'id', req.params.triplerId);

  if (!found) {
    return error(404, res, "Tripler not found");
  }

  if (req.body.phone) {
    if (!validatePhone(req.body.phone)) {
      return error(400, res, "Our system doesn't recognize that phone number. Cannot update tripler. Please try again.");
    }

    if (!await validateUniquePhone('Tripler', req.body.phone, found.get('id'))) {
      return error(400, res, "That phone number is already in use.");
    }
  }

  if (req.body.email) {
    if (!validateEmail(req.body.email)) return _400(res, "Invalid email");

    if (!await validateUnique('Tripler', { email: req.body.email }, found.get('id'))) {
      return error(400, res, "Tripler with this email already exists.");
    }
  }

  let json;
  try {
    json = await getUserJsonFromRequest(req.body);
  } catch (error) {
    return error(400, res, error.message);
  }
  let updated = await found.update(json);
  return res.json(serializeTripler(updated));
}

async function startTriplerConfirmation(req, res) {
  let ambassador = req.user;
  let tripler = null;
  ambassador.get('claims').forEach((entry) => {
    if (entry.otherNode().get('id') === req.params.triplerId) {
      tripler = entry.otherNode();
    }
  });

  if (!tripler) {
    return error(400, res, "Invalid tripler id, could not start tripler confirmation.", { ambassador: serializeAmbassador(ambassador), triplerId: req.params.triplerId });
  }

  let triplerPhone = req.body.phone ? normalizePhone(req.body.phone): tripler.get('phone');

  const verifications = verifyCallerIdAndReversePhone(triplerPhone);

  if (tripler.get('status') !== 'unconfirmed') {
    return error(400, res, "Invalid status, cannot proceed to begin tripler confirmation.", { ambassador: serializeAmbassador(ambassador), tripler: serializeTripler(tripler), verification: verifications });
  }

  if (triplerPhone) {
    if (!validatePhone(triplerPhone)) {
      return error(400, res, "Our records suggest that this number may not be the vote tripler's phone number. Please email support@blockpower.vote for help. E4");
    }

    if (!await validateUniquePhone('Tripler', triplerPhone, tripler.get('id'))) {
      return error(400, res, "Our records suggest that this number may not be the vote tripler's phone number. Please email support@blockpower.vote for help. E3", { ambassador: serializeAmbassador(ambassador), tripler: serializeTripler(tripler), verification: verifications });
    }
  }

  if (triplerPhone === ambassador.get('phone')) {
    return error(400, res, "Our records suggest that this number may not be the vote tripler's phone number. Please email support@blockpower.vote for help. E2");
  }

  const { carrier: { name: carrierName, isBlocked } } = await validateCarrier(triplerPhone);
  if (isBlocked) {
    await triplersSvc.updateTriplerBlockedCarrier(tripler, carrierName);
    return error(400, res, "Our records suggest that this number may not be the vote tripler's phone number. Please email support@blockpower.vote for help. E1", { ambassador: serializeAmbassador(ambassador), tripler: serializeTripler(tripler)});
  } else {
    await triplersSvc.updateTriplerCarrier(tripler, carrierName);
  }

  let triplees = req.body.triplees;
  if (!triplees || triplees.length !== 3) {
    return error(400, res, 'Insufficient triplees, cannot start confirmation')
  }

  try {
    await triplersSvc.startTriplerConfirmation(ambassador, tripler, triplerPhone, triplees, verifications);
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
    return error(400, res, "Invalid tripler id, could not remind tripler.", { ambassador: ambassador, triplerId: req.params.triplerId });
  }
  else if (tripler.get('status') !== 'pending') {
    return error(400, res, "Invalid status, cannot proceed to remind tripler.", { ambassador: ambassador, triplerId: req.params.triplerId });
  }

  let new_phone = req.body.phone;
  if (new_phone) {
    if (!validatePhone(req.body.phone)) {
      return error(400, res, "Our records suggest that this number may not be the vote tripler's phone number. Please email support@blockpower.vote for help. E4");
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
    return error(400, res, "Invalid status, cannot confirm tripler.", serializeTripler(tripler));
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
