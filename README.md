## Introduction

This software enables a "Voting Ambassador" workflow for get-out-the-vote campaigns. The Vote Ambassador, once signed up, is provided a list of voters in their area (within some configurable number of meters from the Ambassador). This distance is calculated via the Neo4J apoc.distance function, using the Point data type either imported from CSV in the case of a Tripler, or pulled from an external API (census.gov) in the case of Ambassadors.

Once the Ambassador has "claimed" a list of Vote Triplers, the Vote Triplers can be contacted through the system, requesting confirmation that they will assist 3 people to vote. If that Vote Tripler responds in the affirmative to the SMS, the system will record a payment for the Vote Ambassador. This can take the form of Stripe or other payment method.

Also see the [CONTRIBUTING](/CONTRIBUTING.md) document for more background and a technical overview.

### Frontend

A Vote Ambassador signs up with and interacts mainly with the React front-end. The front-end code can be found here: [hello-voter](https://github.com/colab-coop/hello-voter).

### Admin-ui

This software also has the concept of "admin", an Ambassador account which is empowered to block Ambassadors, make another Ambassador an admin, and download CSV data reports of Ambassadors and their claimed Triplers.

The admin panel can be found here: [https://github.com/colab-coop/HelloVoter-admin-ui](https://github.com/colab-coop/HelloVoter-admin-ui).

## Development

### Prerequisites

- Node. We recommend installing via [Node Version Manager](https://github.com/nvm-sh/nvm#installing-and-updating).
- [Docker](https://docs.docker.com/desktop/) is required to get the database running.

### Installation

1. Copy `.env.example` to `.env` and modify as needed: `cp server/.env.example server/.env`
1. Install dependencies: `npm install`
1. Setup the database: `npm run database`
1. (optional) Seed the database with fake data: `(cd server && npm run seed:fresh)`
1. Start the server: `npm start`

### Usage

After following the steps above,

1. The API will be available at <http://localhost:8080/api/v1/>
1. The Neo4j Browser will be available at <http://localhost:7474/browser/>
   - Username `neo4j`, default password `hellovoter`
   - Example query to see all data: `MATCH (n) RETURN n`

For local development without requiring real OAuth:

1. Set `REACT_APP_NO_AUTH=1`
1. Modify an Ambassador to work with a mock Authorization token: `MATCH (a:Ambassador {admin: true}) SET a.external_id = "noauth:localuser"`
1. Use this Bearer token when making requests: `eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6Im5vYXV0aDpsb2NhbHVzZXIiLCJuYW1lIjoiTG9jYWwgVXNlciIsImVtYWlsIjoibG9jYWxAbG9jYWxob3N0IiwiaXNzIjoib3Vydm9pY2V1c2Eub3JnIiwiaWF0IjoxLCJleHAiOjIsImRpc2NsYWltZXIiOiJCbGFoIGJsYWggZGlzY2xhaW1lciJ9.qa5K2pgi1uLYkV7jP3aNvazcchvgBD8RwhdG6Q86GxlvusQx7nNCTr3LrAnn6pxDJxNidJoqjD3Ie77jj5hWK_-lbgtHMLhNXGExDxI8pQ0I5ZnAV_5pDu7vARinoy3mctQWFO2pIQSu8KzQc7eQ90IQZBseE7nQV-ugZRfK8Teo_48COcJxGxqwCNCO80G_JzBoif2xaWRb2i2n0qeSUKfXN4Fwy46JOiHFnL9yOS5s54tB6doe1wFJNYps8eVQbVkTBL1I9PQP4Gs-BmzND0vcQaczTdu_J50uvLL5do1FHb48lRhrA44ZrYv3EVwNsJXZtH3MbasxgPrZhl69VQ`

### Debugging

1. See hellovoter.log for output: `less +F server/hellovoter.log`

## Production Deployment

Note the deployment branch for the api is "ambassador", with tagged releases.

We (CoLab) are currently using an AWS cluster to deploy all of this code (api, frontend, and admin-ui). We use an Ansible playbook to provision the servers. We point the servers to a Neo4J database hosted at Graphene. The frontend is also hosted on an AWS server in the cluster, also using an Ansible playbook. We have CircleCI workflows implemented for deployment.

You are, of course, free to deploy in any way you wish, but we have not attempted any other deployment configuration so YMMV.

## License

    Software License Agreement (AGPLv3+)

    Copyright (c) 2020, Our Voice USA. All rights reserved.

        This program is free software; you can redistribute it and/or
        modify it under the terms of the GNU Affero General Public License
        as published by the Free Software Foundation; either version 3
        of the License, or (at your option) any later version.

        This program is distributed in the hope that it will be useful,
        but WITHOUT ANY WARRANTY; without even the implied warranty of
        MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
        GNU Affero General Public License for more details.

        You should have received a copy of the GNU Affero General Public License
        along with this program; if not, write to the Free Software
        Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301, USA.

**NOTE:** We relicense the mobile app code for the purposes of distribution on the App Store. For details, read our [CLA Rationale](CLA-Rationale.md)

Logos, icons, and other artwork depicting the Our Voice bird are copyright and not for redistribution without express written permission by Our Voice USA.

NOTES:

<!-- To collect the info inside the DB -->

- change code inside /Users/azra/Desktop/BlockPower.Vote/HelloVoter/server/app/models/va/Ambassador.js to add the DOB to the model (lines 48-51)

- inside the api that takes DOB data from FE and passes it to start tripler confimration: /Users/azra/Desktop/BlockPower.Vote/HelloVoter/server/app/routes/api/v1/va/triplers.js (line 228)

- /Users/azra/Desktop/BlockPower.Vote/HelloVoter/server/app/services/triplers.js inside the function that actually makes the update startTriplerConfirmation

<!-- To store the info inside the CSV etc -->
