import mail from '../lib/mail';
import { ov_config } from '../lib/ov_config';
import { _400, _404, _500 } from '../lib/utils';

async function error(code, res, err, details) {
  try {
    const subject = `Error ${code}: ${err}`;
    const body = details
      ? `Error ${code}: ${err}\n\n${JSON.stringify(details)}`
      : `Error ${code}: ${err}`;
    await mail(ov_config.admin_emails, null, null, subject, body);
  } catch (err) {
    throw "Error sending email to admin on error"
  }

  if (code === 400) {
    return _400(res, err)
  } else if (code === 404) {
    return _404(res, err)
  } else if (code === 500) {
    return _500(res, err)
  }
}

module.exports = {
  error: error
}
