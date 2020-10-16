import { v4 as uuidv4 } from 'uuid';
import stringFormat from 'string-format';

import logger from 'logops';
import neode from '../lib/neode';

import {
  validateEmpty, validatePhone, validateEmail
} from '../lib/validations';

import { ValidationError } from '../lib/errors';
import { trimFields, geoCode, serializeName, zipToLatLon } from '../lib/utils';
import { normalize } from '../lib/phone';
import mail from '../lib/mail';
import { ov_config } from '../lib/ov_config';

import models from '../models/va';

async function findByExternalId(externalId) {
  return await neode.first('Ambassador', 'external_id', externalId);
}

async function findById(id) {
  return await neode.first('Ambassador', 'id', id);
}

async function findAmbassadorsWithPendingDisbursements() {
  let query = `MATCH (a:Ambassador)-[:GETS_PAID]->(:Payout {status: \'pending\'}) WHERE a.approved = true RETURN a.id`;
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
  let query = `MATCH (a:Ambassador)-[:GETS_PAID]->(:Payout {status: \'disbursed\'}) WHERE a.approved = true RETURN a.id`;
  let res = await neode.cypher(query);
  let ambassadors = [];
  if (res.records.length > 0) {
    ambassadors = await Promise.all(res.records.map(async (entry) => {
      return await findById(entry._fields[0]);
    }));
  }
  return ambassadors;
}

async function signup(json, verification, carrierLookup) {
  json = trimFields(json)

  if (!validateEmpty(json, ['first_name', 'phone', 'address'])) {
    throw new ValidationError("Invalid payload, ambassador cannot be created");
  }

  if (!validatePhone(json.phone)) {
    throw new ValidationError("Our system doesn’t recognize that phone number. Please try again.");
  }

  // Ensure that address.state is always uppercase
  let address = json.address;
  address.state = address.state.toUpperCase();
  address.zip = address.zip.toString().split(' ').join('');

  let allowed_states = ov_config.allowed_states.toUpperCase().split(',');
  if (allowed_states.indexOf(address.state) === -1) {
    throw new ValidationError("Sorry, but state employment laws don't allow us to pay Voting Ambassadors in your state.", { ambassador: json, verification: verification });
  }

  if (models.Ambassador.phone.unique) {
    let existing_ambassador = await neode.first('Ambassador', 'phone', normalize(json.phone));
    if (existing_ambassador) {
      throw new ValidationError("You already have an account. Email support@blockpower.vote for help. E5", { ambassador: json, verification: verification });
    }
  }

  if (models.Ambassador.external_id.unique && !ov_config.stress) {
    let existing_ambassador = await neode.first('Ambassador', 'external_id', json.externalId);
    if (existing_ambassador) {
      throw new ValidationError("If you have already signed up as an Ambassador using Facebook or Google, you cannot sign up again.");
    }
  }

  if (json.email) {
    if (!validateEmail(json.email)) throw "Invalid email";

    if (models.Ambassador.email.unique &&
      await neode.first('Ambassador', 'email', json.email)) {
      throw new ValidationError("You already have an account. Email support@blockpower.vote for help. E6");
    }
  }

  let coordinates = await geoCode(address);
  if (coordinates === null) {
    coordinates = await zipToLatLon(address.zip);
  }
  if (coordinates === null) {
    throw new ValidationError("Our system doesn’t recognize that zip code. Please try again.");
  }

  let new_ambassador = await neode.create('Ambassador', {
    id: uuidv4(),
    first_name: json.first_name,
    last_name: json.last_name || null,
    phone: normalize(json.phone),
    email: json.email || null,
    date_of_birth: json.date_of_birth || null,
    address: JSON.stringify(address, null, 2),
    quiz_results: JSON.stringify(json.quiz_results, null, 2) || null,
    approved: true,
    locked: false,
    signup_completed: true,
    onboarding_completed: true,
    location: {
      latitude: parseFloat(coordinates.latitude, 10),
      longitude: parseFloat(coordinates.longitude, 10)
    },
    external_id: ov_config.stress ? json.externalId + Math.random() : json.externalId,
    verification: JSON.stringify(verification, null, 2),
    carrier_info: JSON.stringify(carrierLookup, null, 2)
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
    ${new_ambassador.get('verification')}
    <br>
    <br>
    Carrier:
    <br>
    ${new_ambassador.get('carrier_info')}
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

async function getPrimaryAccount(ambassador) {
  let relationships = ambassador.get('owns_account');
  let primaryAccount = null;

  if (relationships.length > 0) {
    relationships.forEach((ownsAccount) => {
      if (ownsAccount.otherNode().get('is_primary')) {
        primaryAccount = ownsAccount.otherNode();
      }
    });
  }

  return primaryAccount;
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
  getPrimaryAccount: getPrimaryAccount,
  unclaimTriplers: unclaimTriplers
};
