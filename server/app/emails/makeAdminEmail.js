import { ov_config } from '../lib/ov_config';

export const makeAdminEmail = (ambassador, address) => `
Organization Name:
<br>
${ov_config.organization_name}
<br>
<br>
Google/FB ID:
<br>
${ambassador.get('external_id')}
<br>
<br>
First Name:
<br>
${ambassador.get('first_name')}
<br>
<br>
Last Name:
<br>
${ambassador.get('last_name')}
<br>
<br>
Date of Birth:
<br>
${ambassador.get('date_of_birth')}
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
${ambassador.get('email')}
<br>
<br>
Phone Number:
<br>
${ambassador.get('phone')}
<br>
<br>
`;
