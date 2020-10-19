/**
 * Wrapper plus some logic around the Twilio Carrier API.
 *
 * This function reads a pipe delimited list of strings from the
 * "BLOCKED_CARRIERS" env param and calls Twilio to get the
 * carrier name of the supplied phone number.
 *
 * The function will return the carrier lookup info, additionally
 * decorated with lookup.carrier.isBlocked = (null) <true/false>
 *
 * ref: https://www.twilio.com/docs/lookup/api
 */

import logger from 'logops';
import { internationalNumber } from './normalizers';
import { ov_config } from './ov_config';
import { getTwilioClient } from './twilio';

const client = getTwilioClient();

module.exports = async (phone) => {

  logger.debug(`[TWILIO] Checking carrier for ${internationalNumber(phone)}`);

  // Exit early and don't perform a lookup if nothing is blocked in config
  // or if Twilio is disabled in config.
  let blockedCarrierString = ov_config.blocked_carriers
  if(!blockedCarrierString || ov_config.twilio_disable) {
    let result = new Promise((resolve, reject) => {
      let carrier = {
        "caller_name": null,
        "carrier": {
          "error_code": null,
          "mobile_country_code": null,
          "mobile_network_code": null,
          "name": "Carrier Lookup Skipped",
          "type": null,
          "isBlocked": null,
        },
        "country_code": null,
        "national_format": null,
        "phone_number": null,
        "add_ons": null,
        "url": null
      }
      logger.debug(`[TWILIO] Carrier lookup skipped, either TWILIO_DISABLE is set in env or BLOCKED_CARRIERS env not set or empty.`);
      resolve(carrier)
    });
    return result;
  }

  let lookup = await client.lookups.phoneNumbers(internationalNumber(phone))
    .fetch({type:['carrier']});

  let blockedCarriers = blockedCarrierString.split('|').map((val) => val.toUpperCase());
  if(lookup.carrier.error_code !== null) {
    logger.info(`[TWILIO] Carrier lookup failed with error code ${lookup.carrier.error_code}`);
    lookup.carrier.isBlocked = null;
    return lookup;
  } else {
    let carrierName = lookup.carrier.name.toUpperCase()
    let isBlocked = blockedCarriers.includes(carrierName)
    if(isBlocked) {
      logger.info(`[TWILIO] Carrier ${carrierName} for ${internationalNumber(phone)} is blocked in config`);
    }
    lookup.carrier.isBlocked = isBlocked;
    return lookup;
  }
};
