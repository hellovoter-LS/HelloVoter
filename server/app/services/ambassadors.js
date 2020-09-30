import { v4 as uuidv4 } from 'uuid';
import stringFormat from 'string-format';

import logger from 'logops';
import neode from '../lib/neode';

import {
  validateEmpty, validatePhone, validateEmail
} from '../lib/validations';

import { ValidationError } from '../lib/errors';
import { geoCode, serializeName, zipToLatLon } from '../lib/utils';
import { normalize } from '../lib/phone';
import mail from '../lib/mail';
import { ov_config } from '../lib/ov_config';
import caller_id from '../lib/caller_id';
import reverse_phone from '../lib/reverse_phone';

import models from '../models/va';

async function findByExternalId(externalId) {
  return await neode.first('Ambassador', 'external_id', externalId);
}

async function findById(id) {
  return await neode.first('Ambassador', 'id', id);
}

async function findAmbassadorsWithPendingDisbursements() {
  let query = `MATCH (a:Ambassador)-[:GETS_PAID]->(:Payout {status: \'pending\'}) RETURN a.id`;
  let res = await neode.cypher(query);
  let ambassadors = [];
  if (res.records.length > 0) {
    ambassadors = await Promise.all(res.records.map(async (entry) => {
      return await findById(entry._fields[0]);
    }));
  }
  return ambassadors;
}

async function findAmbassadorsWithPendingSettlements() {
  let query = `MATCH (a:Ambassador)-[:GETS_PAID]->(:Payout {status: \'disbursed\'}) RETURN a.id`;
  let res = await neode.cypher(query);
  let ambassadors = [];
  if (res.records.length > 0) {
    ambassadors = await Promise.all(res.records.map(async (entry) => {
      return await findById(entry._fields[0]);
    }));
  }
  return ambassadors;
}

async function signup(json) {
  if (!validateEmpty(json, ['first_name', 'phone', 'address'])) {
    throw new ValidationError("Invalid payload, ambassador cannot be created");
  }

  if (!validatePhone(json.phone)) {
    throw new ValidationError("Our system doesn’t recognize that phone number. Please try again.");
  }

  // Ensure that address.state is always uppercase
  let address = json.address;
  address.state = address.state.split(' ').join('').toUpperCase();


  let allowed_states = ov_config.allowed_states.toUpperCase().split(',');
  if (allowed_states.indexOf(address.state) === -1) {
    throw new ValidationError("Sorry, but state employment laws don't allow us to pay Voting Ambassadors in your state.")
  }

  if (models.Ambassador.phone.unique) {
    let existing_ambassador = await neode.first('Ambassador', 'phone', normalize(json.phone));
    if (existing_ambassador) {
      throw new ValidationError("That phone number is already in use.");
    }
  }

  if (models.Ambassador.external_id.unique) {
    let existing_ambassador = await neode.first('Ambassador', 'external_id', json.externalId);
    if (existing_ambassador) {
      throw new ValidationError("If you have already signed up as an Ambassador using Facebook or Google, you cannot sign up again.");
    }
  }

  if (json.email) {
    if (!validateEmail(json.email)) throw "Invalid email";

    if (models.Ambassador.email.unique &&
      await neode.first('Ambassador', 'email', json.email)) {
      throw new ValidationError("That email address is already in use.");
    }
  }

  let coordinates = await geoCode(address);
  if (coordinates === null) {
    coordinates = await zipToLatLon(json.address.zip);
  }
  if (coordinates === null) {
    throw new ValidationError("Our system doesn’t recognize that zip code. Please try again.");
  }

  // check against Twilio caller ID and Ekata data
  let twilioCallerId = await caller_id(json.phone);
  let ekataReversePhone = await reverse_phone(json.phone);

  let verification = [];

  if (twilioCallerId) {
    try {
      verification.push({
        source: 'Twilio',
        name: twilioCallerId.callerName && twilioCallerId.callerName.caller_name
      })
    } catch (err) {
      logger.error("Could not get verification info for ambassador: %s", err);
    }
  }

  if (ekataReversePhone) {
    try {
      verification.push({
        source: 'Ekata',
        name: ekataReversePhone.addOns.results && ekataReversePhone.addOns.results.ekata_reverse_phone.result && ekataReversePhone.addOns.results.ekata_reverse_phone.result.belongs_to && ekataReversePhone.addOns.results.ekata_reverse_phone.result.belongs_to.name
      })
    } catch (err) {
      logger.error("Could not get verification info for ambassador: %s", err);
    }
  }

  let new_ambassador = await neode.create('Ambassador', {
    id: uuidv4(),
    first_name: json.first_name,
    last_name: json.last_name || null,
    phone: normalize(json.phone),
    email: json.email || null,
    date_of_birth: json.date_of_birth || null,
    address: JSON.stringify(address),
    quiz_results: JSON.stringify(json.quiz_results) || null,
    approved: true,
    locked: false,
    signup_completed: true,
    onboarding_completed: true,
    location: {
      latitude: parseFloat(coordinates.latitude, 10),
      longitude: parseFloat(coordinates.longitude, 10)
    },
    external_id: json.externalId,
    verification: JSON.stringify(verification)
  });

  let existing_tripler = await neode.first('Tripler', {
    phone: normalize(json.phone)
  });

  if (existing_tripler) {
    new_ambassador.relateTo(existing_tripler, 'was_once');
  }

  // send email in the background
  let ambassador_name = serializeName(new_ambassador.get('first_name'), new_ambassador.get('last_name'))
  setTimeout(async () => {
    let address = JSON.parse(new_ambassador.get('address'));
    let body = `
    Organization Name:
    <br>
    ${ov_config.organization_name}
    <br>
    <br>
    Google/FB ID:
    <br>
    ${new_ambassador.get('external_id')}
    <br>
    <br>
    First Name:
    <br>
    ${new_ambassador.get('first_name')}
    <br>
    <br>
    Last Name:
    <br>
    ${new_ambassador.get('last_name')}
    <br>
    <br>
    Date of Birth:
    <br>
    ${new_ambassador.get('date_of_birth')}
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
    ${new_ambassador.get('email')}
    <br>
    <br>
    Phone Number:
    <br>
    ${new_ambassador.get('phone')}
    <br>
    <br>
    Verification:
    <br>
    ${JSON.parse(new_ambassador.get('verification')).map(v => v.source + ': ' + v.name).join(', ')}
    <br>
    <br>
    `;

    let subject = stringFormat(ov_config.new_ambassador_signup_admin_email_subject,
      {
        organization_name: ov_config.organization_name
      });
    await mail(ov_config.admin_emails, null, null,
      subject,
      body);
  }, 100);

  return new_ambassador;
}

async function unclaimTriplers(req) {
  let ambassador = req.user;

  for (var x = 0; x < req.body.triplers.length; x++) {
    let result = await req.neode.query()
      .match('a', 'Ambassador')
      .where('a.id', ambassador.get('id'))
      .relationship('CLAIMS', 'out', 'r')
      .to('t', 'Tripler')
      .where('t.id', req.body.triplers[x])
      .detachDelete('r')
      .execute()
  }
}

module.exports = {
  findByExternalId: findByExternalId,
  findById: findById,
  findAmbassadorsWithPendingDisbursements: findAmbassadorsWithPendingDisbursements,
  findAmbassadorsWithPendingSettlements: findAmbassadorsWithPendingSettlements,
  signup: signup,
  unclaimTriplers: unclaimTriplers
};
