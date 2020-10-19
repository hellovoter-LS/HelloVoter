import { v4 as uuidv4 } from 'uuid';
import stringFormat from 'string-format';

import neode from '../lib/neode';

import {
  validateEmpty, validatePhone, validateEmail, validateState, validateUniquePhone, validateUnique
} from '../lib/validations';

import { ValidationError } from '../lib/errors';
import { trimFields, geoCode, zipToLatLon } from '../lib/utils';
import { normalizePhone } from '../lib/normalizers';
import mail from '../lib/mail';
import { ov_config } from '../lib/ov_config';
import { signupEmail } from '../emails/signupEmail';
import { normalizeAddress } from '../lib/normalizers';

async function findByExternalId(externalId) {
  return await neode.first('Ambassador', 'external_id', externalId);
}

async function findById(id) {
  return await neode.first('Ambassador', 'id', id);
}

async function signup(json, verification, carrierLookup) {
  json = trimFields(json)

  if (!validateEmpty(json, ['first_name', 'phone', 'address'])) {
    throw new ValidationError("Invalid payload, ambassador cannot be created");
  }

  if (!validatePhone(json.phone)) {
    throw new ValidationError("Our system doesn't recognize that phone number. Please try again.");
  }

  let address = normalizeAddress(json.address);

  if (!validateState(address.state)) {
    throw new ValidationError("Sorry, but state employment laws don't allow us to pay Voting Ambassadors in your state.", { ambassador: json, verification: verification });
  }

  if (!await validateUniquePhone('Ambassador', json.phone)) {
    throw new ValidationError("You already have an account. Email support@blockpower.vote for help. E5", { ambassador: json, verification: verification });
  }

  if (!await validateUnique('Ambassador', { external_id: json.externalId })) {
    throw new ValidationError("If you have already signed up as an Ambassador using Facebook or Google, you cannot sign up again.");
  }

  if (json.email) {
    if (!validateEmail(json.email)) {
      throw new ValidationError("Invalid email");
    }

    if (!await validateUnique('Ambassador', { email: json.email })) {
      throw new ValidationError("You already have an account. Email support@blockpower.vote for help. E6");
    }
  }

  let coordinates = await geoCode(address);
  if (coordinates === null) {
    coordinates = await zipToLatLon(address.zip);
  }
  if (coordinates === null) {
    throw new ValidationError("Our system doesn't recognize that zip code. Please try again.");
  }

  let new_ambassador = await neode.create('Ambassador', {
    id: uuidv4(),
    first_name: json.first_name,
    last_name: json.last_name || null,
    phone: normalizePhone(json.phone),
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
    phone: normalizePhone(json.phone)
  });

  if (existing_tripler) {
    new_ambassador.relateTo(existing_tripler, 'was_once');
  }

  // send email in the background
  setTimeout(async () => {
    let address = JSON.parse(new_ambassador.get('address'));
    let body = signupEmail(new_ambassador, address);
    let subject = stringFormat(ov_config.new_ambassador_signup_admin_email_subject, {
      organization_name: ov_config.organization_name
    });
    await mail(ov_config.admin_emails, null, null, subject, body);
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
  signup: signup,
  getPrimaryAccount: getPrimaryAccount,
  unclaimTriplers: unclaimTriplers
};
