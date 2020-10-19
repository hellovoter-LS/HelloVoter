import neo4j from 'neo4j-driver';
import PhoneNumber from 'awesome-phonenumber';
import { geoCode } from './utils';
import { ValidationError } from './errors';

const WGS_84_2D = 4326;

const ALLOWED_ATTRS = ['first_name', 'last_name', 'date_of_birth', 'email', 'status'];

export function normalizeAddress(address) {
  return {
    ...address,
    state: address.state.toUpperCase(),
    zip: address.zip.toString().replaceAll(' ', ''),
  };
}

export function internationalNumber(phone) {
  return (new PhoneNumber(phone, 'US')).getNumber('international');
}

export function normalizePhone(phone) {
  return internationalNumber(phone).replace(/[^0-9xX]/g, '')
}

/** This can handle both Ambassadors and Triplers. */
export async function getUserJsonFromRequest(body) {
  const json = {};

  for (const prop in body) {
    if (ALLOWED_ATTRS.indexOf(prop) >= 0) {
      json[prop] = body[prop];
    }
  }

  if (body.phone) {
    json.phone = normalizePhone(body.phone);
  }

  if (body.address) {
    const coordinates = await geoCode(body.address);
    if (!coordinates) {
      throw new ValidationError("Invalid address.");
    }
    json.address = JSON.stringify(body.address, null, 2);
    json.location = new neo4j.types.Point(
      WGS_84_2D,
      coordinates.longitude,
      coordinates.latitude,
    );
  }

  if (body.quiz_results) {
    json.quiz_results = JSON.stringify(body.quiz_results, null, 2);
  }

  if (body.triplees) {
    json.triplees = JSON.stringify(body.triplees, null, 2);
  }
}
