import { ov_config } from '../lib/ov_config';
import { serializeTripleeForCSV } from '../routes/api/v1/va/serializers';

export const confirmTriplerEmail = (tripler, address, relationship, confirmed_at, ambassador_name, triplees) => `
Organization Name:
<br>
${ov_config.organization_name}
<br>
<br>
LALVOTERID:
<br>
${tripler.get("voter_id")}
<br>
<br>
First Name:
<br>
${tripler.get("first_name")}
<br>
<br>
Last Name:
<br>
${tripler.get("last_name")}
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
Date Claimed:
<br>
${new Date(relationship.get("since"))}
<br>
<br>
Date Confirmed:
<br>
${new Date(confirmed_at)}
<br>
<br>
Ambassador:
<br>
${ambassador_name}
<br>
<br>
Phone Number:
<br>
${tripler.get("phone")}
<br>
<br>
Triplee 1:
<br>
${serializeTripleeForCSV(triplees[0])}
<br>
<br>
Triplee 2:
<br>
${serializeTripleeForCSV(triplees[1])}
<br>
<br>
Triplee 3:
<br>
${serializeTripleeForCSV(triplees[2])}
<br>
<br>
Verification:
<br>
${tripler.get('verification')}
<br>
<br>
Carrier Info:
<br>
${tripler.get('carrier_info')}
<br>
<br>
Blocked Carrier Info:
<br>
${tripler.get('blocked_carrier_info')}
<br>
<br>
`;
