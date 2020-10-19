import { ov_config } from '../lib/ov_config';

export const signupEmail = (new_ambassador, address) => `
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
