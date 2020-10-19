import { Router } from 'express';
import triplerSvc from '../../../../../services/triplers';
import { normalizePhone } from '../../../../../lib/normalizers';
import { ov_config } from '../../../../../lib/ov_config';

module.exports = Router({mergeParams: true})
.post('/sms/receive', async (req, res) => {

  // TODO security check needed to confirm message came from twilio

  let sender = normalizePhone(req.body.From);
  let response = req.body.Body.toLowerCase();

  if (ov_config.twilio_support_proxy_response) {
    let arr = response.split('=>').map((entry)=>entry.trim()).filter((entry)=>entry.length > 0)
    response = arr[0];
    if (arr.length > 1) {
      sender = normalizePhone(arr[1]);
    }
  }

  let tripler = await triplerSvc.findByPhone(sender);
  try {
    if (tripler) {
      if (response === 'yes') {
        await triplerSvc.confirmTripler(tripler.get('id'));
      }
      else if (response === 'no') {
        await triplerSvc.detachTripler(tripler.get('id'));
      }
      else {
        await triplerSvc.reconfirmTripler(tripler.get('id'));
      }
    }
    else {
      req.logger.error("Tripler not found", sender);
    }
  }
  catch(err) {
    req.logger.error(`Error while processing response ${response} from sender ${sender}: ${err}`);
  }

  return res.send({});
})
