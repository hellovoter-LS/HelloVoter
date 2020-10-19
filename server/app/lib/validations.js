import PhoneNumber from 'awesome-phonenumber';
import EmailValidator from 'email-validator';
import neode from '../lib/neode';
import { ov_config } from './ov_config';
import { normalizePhone } from './normalizers';
import carrier from './carrier';
import caller_id from './caller_id';
import reverse_phone from './reverse_phone';

const ENFORCE_UNIQUE = !ov_config.stress_testing;

const ALLOWED_STATES = ov_config.allowed_states
  .toUpperCase()
  .split(',')
  .map((state) => state.trim());

function _isEmpty(obj) {
  if (!obj) return true;
  if (typeof obj === 'object') return Object.keys(obj).length === 0;
  if (typeof obj === 'string') return !(obj.trim());
  return false;
}

export function validateEmpty(obj, keys) {
  if (_isEmpty(obj)) return false;
  for (var i = 0; i < keys.length; i++) {
    if (_isEmpty(obj[keys[i]])) return false;
  }
  return true;
}

export function validatePhone(phone) {
  return (new PhoneNumber(phone, 'US')).isValid();
}

export function validateEmail(email) {
  return EmailValidator.validate(email);
}

export async function validateUniquePhone(modelName, phone, existingId = null) {
  return validateUnique(modelName, { phone: normalizePhone(phone) }, existingId);
}

/**
 * Returns true if a node with these properties does not yet exist,
 * or if it only matches the given ID (useful when updating an existing node).
 */
export async function validateUnique(modelName, properties, existingId = null) {
  if (!ENFORCE_UNIQUE) {
    return true;
  }
  const all = await neode.all(modelName, properties);
  if (all.length === 0) return true;
  if (all.length > 1) return false;
  const only = all[0];
  return existingId == null || only.get('id') === existingId;
}

export function validateState(state) {
  return ALLOWED_STATES.indexOf(state) >= 0;
}

export async function validateCarrier(phone) {
  return await carrier(normalizePhone(phone));
}

/** Check against Twilio caller ID and Ekata data. */
export async function verifyCallerIdAndReversePhone(phone) {
  const verifications = [];

  let twilioCallerId = await caller_id(phone);
  if (twilioCallerId) {
    try {
      verifications.push({
        source: 'Twilio',
        name: twilioCallerId
      })
    } catch (err) {
      logger.error("Could not get verification info for ambassador: %s", err);
    }
  }

  let ekataReversePhone = await reverse_phone(phone);
  if (ekataReversePhone) {
    try {
      verifications.push({
        source: 'Ekata',
        name: ekataReversePhone.addOns.results.ekata_reverse_phone
      })
    } catch (err) {
      logger.error("Could not get verification info for ambassador: %s", err);
    }
  }

  return verifications;
}
