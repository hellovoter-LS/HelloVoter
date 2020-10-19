/**
 * Wrapper plus some logic around the Twilio Caller ID API.
 *
 * The function will return the caller-name lookup info.
 *
 * ref: https://www.twilio.com/docs/lookup/api
 */

import logger from 'logops';
import { internationalNumber } from './normalizers';
import { ov_config } from './ov_config';
import { getTwilioClient } from './twilio';

const client = getTwilioClient();

module.exports = async (phone) => {

  logger.debug(`[TWILIO] Fetching caller info for ${internationalNumber(phone)}`);

  // Exit early and don't perform a lookup if Twilio is disabled in config.
  if(ov_config.twilio_disable) {
    let result = new Promise((resolve, reject) => {
      let carrier = {
        "callerName": {
            "caller_name": null,
            "caller_type": null,
            "error_code": null
        },
        "countryCode": null,
        "phoneNumber": null,
        "nationalFormat": null,
        "carrier": null,
        "addOns": null,
        "url": null
      }
      logger.debug(`[TWILIO] Caller name lookup skipped TWILIO_DISABLE is set in env.`);
      resolve(carrier)
    });
    return result;
  }

  let lookup = await client.lookups.phoneNumbers(internationalNumber(phone))
    .fetch({type:['caller-name']});

  return lookup;
};
