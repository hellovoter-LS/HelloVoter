
## Configuration

For this server, configure an `.env` file. The following is a complete list of variables and their defaults:

    SERVER_PORT=8080
    NEO4J_PROTOCOL=bolt
    NEO4J_HOST=localhost
    NEO4J_PORT=7687
    NEO4J_USER=neo4j
    NEO4J_PASSWORD=hellovoter
    NEO4J_ENTERPRISE=false
    NEO4J_JMX_PORT=9999
    NEO4J_JMX_USER=monitor
    NEO4J_JMX_PASS=Neo4j
    ENABLE_GEOCODE=false
    DISABLE_JMX=
    DISABLE_APOC=
    DISABLE_SPATIAL=
    IP_HEADER=
    GOOGLE_MAPS_KEY=
    JOB_CONCURRENCY=1
    SM_OAUTH_URL=https://ws.ourvoiceusa.org/auth
    JWT_PUB_KEY=SM_OAUTH_URL/pubkey
    WABASE=https://apps.ourvoiceusa.org
    AUTOENROLL_FORMID=
    VOLUNTEER_ADD_NEW=
    PURGE_IMPORT_RECORDS=
    DEBUG=
    PAYOUT_STRIPE=
    PAYOUT_PAYPAL=
    PAYOUT_PER_TRIPLER=
    PLAID_CLIENT_ID=
    PLAID_SECRET=
    PLAID_PUBLIC_KEY=
    PLAID_ENVIRONMENT=
    STRIPE_SECRET_KEY=
    PAYPAL_ENVIRONMENT=
    PAYPAL_CLIENT_ID=
    PAYPAL_CLIENT_SECRET=
    TWILIO_DISABLE=
    TWILIO_ACCOUNT_SID=
    TWILIO_AUTH_TOKEN=
    TWILIO_FROM=
    TWILIO_SUPPORT_PROXY_RESPONSE=
    ORGANIZATION_NAME=
    AMBASSADOR_LANDING_PAGE=
    BUSINESS_URL=
    AMBASSADOR_APPROVED_MESSAGE=
    AMBASSADOR_SIGNUP_MESSAGE=
    TRIPLER_REMINDER_MESSAGE=
    TRIPLER_CONFIRMATION_MESSAGE=
    TRIPLER_RECONFIRMATION_MESSAGE=
    STRESS_TESTING=
    LOG_REQUESTS=
    LOG_REQUEST_MAX_BODY_LENGTH=
    MAKE_ADMIN_API=
    AMBASSADOR_TRIPLER_RELATION_MAX_DISTANCE=
    SUGGEST_TRIPLER_LIMIT=
    CLAIM_TRIPLER_LIMIT=
    PAYOUT_SCHEDULE=
    FIFO_WAKEUP=
    DISABLE_AUTO_PAYOUTS=
    DISABLE_JMX=
    DISABLE_EMAILS=
    SMTP_SERVICE=
    SMTP_FROM=
    SMTP_USER=
    SMTP_PASSWORD=
    SMTP_SERVER=
    SMTP_USE_TLS=
    SMTP_PORT=
    ADMIN_EMAILS=
    NEW_AMBASSADOR_SIGNUP_ADMIN_EMAIL_SUBJECT=
    NEW_AMBASSADOR_SIGNUP_ADMIN_EMAIL_BODY=
    TRIPLER_CONFIRM_ADMIN_EMAIL_SUBJECT=
    TRIPLER_CONFIRM_ADMIN_EMAIL_BODY=
    DISABLE_UPGRADE_SMS=
    UPGRADE_SMS_WAITING_PERIOD=
    UPGRADE_SMS_SCHEDULE=
    TRIPLER_UPGRADE_MESSAGE=
    WORDPRESS_LANDING=
    ALLOWED_STATES=
    TRIPLER_CONFIRMED_AMBASSADOR_NOTIFICATION=
    FIRST_REWARD_PAYOUT=
    BLOCKED_CARRIERS=
    EKATA_API_KEY=
    EKATA_ADDON=
    REJECTION_SMS_FOR_TRIPLER=
    REJECTION_SMS_FOR_AMBASSADOR=
    REACT_APP_NO_AUTH=
    STRESS=
    EXCLUDE_UNREG_EXCEPT_IN=
    SEARCH_TRIPLER_MAX_DISTANCE=
    PAYOUT_BATCH_SIZE=
    CRON_STRING=

The meaning of each config item is as follows:

* `SERVER_PORT`: Port for node to listen on for http requests.
* `NEO4J_PROTOCOL`: Protocol for talking to neo4j.
* `NEO4J_HOST`: Hostname of your neo4j server.
* `NEO4J_PORT`: Port number of your neo4j server.
* `NEO4J_USER`: Username to use to connect to neo4j.
* `NEO4J_PASSWORD`: Password to use to connect to neo4j.
* `NEO4J_ENTERPRISE`: Flag to enable enterprise features in neo4j.
* `NEO4J_JMX_PORT`: The port on your `NEO4J_HOST` that exposes JMX. This port isn't exposed by default by Neo4j. See "Neo4j Configuration" below for how to set this up on the database side.
* `NEO4J_JMX_USER`: Username to use to connect to neo4j jmx.
* `NEO4J_JMX_PASS`: Password to use to connect to neo4j jmx.
* `ENABLE_GEOCODE`: Allow import of data that doesn't have longitude/latitude
* `DISABLE_JMX`: Don't attempt to connect to neo4j jmx.
* `DISABLE_APOC`: Don't use the neo4j apoc plugin. This limits data import functionality.
* `DISABLE_SPATIAL`: Don't use the neo4j spatial plugin. This limit turf functionality.
* `IP_HEADER`: Name of the header to check for, if you're behind an http reverse proxy and want to deny direct http requests.
* `GOOGLE_MAPS_KEY`: API Key for Google maps. Get one here: https://developers.google.com/maps/documentation/javascript/get-api-key
* `JOB_CONCURRENCY`: Number of import jobs that can run in parallel. This is only relevant if you're using Neo4j Enterprise Edition, as Community Edition is limited to 4 CPUs, and the minimum CPUs required for parallel jobs is 6.
* `SM_OAUTH_URL`: URL of the oauth provider.
* `JWT_PUB_KEY`: Path to the public key of the oauth provider.
* `WABASE`: URL of the HelloVoterHQ react application.
* `AUTOENROLL_FORMID`: The ID of the form new volunteers get auto-enrolled in with autoturf set so they can go right into the map with data, no approval needed. We use this for our demo server. You probably don't want to set this.
* `VOLUNTEER_ADD_NEW`: Whether or not volunteers can add new addresses & people that don't exist in the database.
* `PURGE_IMPORT_RECORDS`: By default, import records are kept in the database, so you can trace where things came from. For larger operations (>20 million), we recommend setting this to `1` as otherwise the speed of data imports will be significantly impacted.
* `DEBUG`: Whether or not cypher and other debugging info is sent to the console log.
* `PAYOUT_STRIPE`: Whether or not stripe is supported as a payout method.
* `PAYOUT_PAYPAL`: Whether or not paypal is supported as a payout method.
* `PAYOUT_PER_TRIPLER`: Amount in cents to be disbursed to the ambassador for every confirmed tripler.
* `PLAID_CLIENT_ID`: The client ID from your Plaid developer account. Needed for ambassador payouts.
* `PLAID_SECRET`: The secret from your Plaid developer account. Needed for ambassador payouts.
* `PLAID_PUBLIC_KEY`: The public key from your Plaid developer account. Needed for ambassador payouts.
* `PLAID_ENVIRONMENT`: The environment plaid is running in, can be sandbox, development or production.
* `STRIPE_SECRET_KEY`: The secret key from your Stripe developer account. Needed for ambassador payouts.
* `PAYPAL_ENVIRONMENT`: The environment paypal is running in, can be sandbox, development or production.
* `PAYPAL_CLIENT_ID`: The client ID from your Paypal developer account. Needed for ambassador payouts.
* `PAYPAL_CLIENT_SECRET`: The secret key from your Paypal developer account. Needed for ambassador payouts.
* `TWILIO_DISABLE`: Setting it to true will disable twilio.
* `TWILIO_ACCOUNT_SID`: SID of twilio account.
* `TWILIO_AUTH_TOKEN`: Auth token of twilio account.
* `TWILIO_FROM`: Number to send SMSes from.
* `TWILIO_SUPPORT_PROXY_RESPONSE`: Support proxy messages for development; message and proxy number separated by =>. For example: yes=>+1 111-111-1111
* `ORGANIZATION_NAME`: The name of the org
* `AMBASSADOR_LANDING_PAGE`: Link to the webpage where ambassador lands after approval, this is sent in SMS
* `BUSINESS_URL`: URL of the business running the platform or url of the organization; used in stripe while creating connect accounts
* `AMBASSADOR_APPROVED_MESSAGE`: The SMS message when an ambassador is approved
* `AMBASSADOR_SIGNUP_MESSAGE`: The SMS message when an ambassador signs up
* `TRIPLER_REMINDER_MESSAGE`: The SMS message when a tripler is reminded
* `TRIPLER_CONFIRMATION_MESSAGE`: The SMS message when a tripler begins confirmation process
* `TRIPLER_RECONFIRMATION_MESSAGE`: The SMS message when a tripler responds to other than YES or NO in response to confirmation message
* `STRESS_TESTING`: If set to true, this introduces changes in the code like non-enforcement of unique constraints to facilitate stress testing. You will have to drop neode schema to be able to do stress testing.
* `LOG_REQUESTS`: If set to true, enable request/response body logging
* `LOG_REQUEST_MAX_BODY_LENGTH`: Maximum number of characters logged during request/response logging, default set to 1000
* `MAKE_ADMIN_API`: Flag to enable `PUT /admin` api which makes an ambassador amin, default set to false
* `AMBASSADOR_TRIPLER_RELATION_MAX_DISTANCE`: Distance in meters to decide if a tripler can be suggested to ambassador, default set to 10000
* `SUGGEST_TRIPLER_LIMIT`: Maximum number of triplers returned by suggest-triplers api, default set to 1000
* `CLAIM_TRIPLER_LIMIT`: Maximum number of triplers an ambassador can claim, default set to 12
* `PAYOUT_SCHEDULE`: Payout schedule in minutes, default set to 60 minutes
* `FIFO_WAKEUP`: FIFO queue wakeup/sleep interval in milliseconds, default set to 300 msec
* `DISABLE_AUTO_PAYOUTS`: Disable automatic payouts
* `DISABLE_JMX`: Disable JMX check from startup
* `DISABLE_EMAILS`: Disable email notifications
* `SMTP_SERVICE`: Name of the SMTP service being used
* `SMTP_FROM`: Email from which emails are to be sent
* `SMTP_USER`: User name for authorizing with SMTP server
* `SMTP_PASSWORD`: Password for authorizing with SMTP server
* `SMTP_SERVER`: Address of SMTP server
* `SMTP_USE_TLS`: Set to true if SMTP server supports secure connections
* `SMTP_PORT`: Port at which SMTP server is listening for connections
* `ADMIN_EMAILS`: Comma separated list of admin emails
* `NEW_AMBASSADOR_SIGNUP_ADMIN_EMAIL_SUBJECT`: Subject of the email sent to admins when new ambassador signs up
* `NEW_AMBASSADOR_SIGNUP_ADMIN_EMAIL_BODY`: Body of the email sent to admins when new ambassador signs up
* `TRIPLER_CONFIRM_ADMIN_EMAIL_SUBJECT`: Subject of the email sent to admins when a tripler confirms
* `TRIPLER_CONFIRM_ADMIN_EMAIL_BODY`: Body of the email sent to admins when a tripler confirms
* `DISABLE_UPGRADE_SMS`: Flag to disable the tripler upgrade sms background job
* `UPGRADE_SMS_WAITING_PERIOD`: The time interval (in minutes)
* `UPGRADE_SMS_SCHEDULE`: The time interval (in minutes) where the tripler upgrade sms background job fires
* `TRIPLER_UPGRADE_MESSAGE`: The SMS message when a tripler responds YES, informing them that they are eligible to become Voter Ambassadors
* `WORDPRESS_LANDING`: The URL for the landing page for when a Tripler wants to upgrade to Ambassador
* `ALLOWED_STATES`: A comma-separated list of 2-letter US state codes that determine which addresses are valid for ambassador signups
* `TRIPLER_CONFIRMED_AMBASSADOR_NOTIFICATION`: The SMS message that gets sent to the ambassador when one of their triplers is confirmed.
* `FIRST_REWARD_PAYOUT`: The amount an ambassador receives as a reward for one of their claimed triplers upgrading to an ambassador and confirming a tripler.
* `BLOCKED_CARRIERS`: A pipe-delimited list of carrier strings in order to block fraudulent phone numbers.
* `EKATA_API_KEY`: API key used for reverse phone lookup API from [Ekata.com](https://ekata.com/developer/documentation/api-overview/#tag/Reverse-Phone-API).
* `EKATA_ADDON`: If Ekata is available as a Twilio add-on, set this to true.
* `REJECTION_SMS_FOR_TRIPLER`: The SMS message that the tripler receives when they reply 'no' to the system.
* `REJECTION_SMS_FOR_AMBASSADOR`: The SMS message that the ambassador receives when one of their triplers replies 'no' to the system.
* `STRESS`: If stress testing, disable twilio verification and external_id uniqueness constraint.
* `EXCLUDE_UNREG_EXCEPT_IN`: Exclude unregistered voters except in these comma-separated 2-char states.
* `SEARCH_TRIPLER_MAX_DISTANCE`: Distance constraint on tripler search
* `PAYOUT_BATCH_SIZE`: How many payouts to attempt per job
* `PAYOUT_CRON_STRING`: Define the payout cron job
* `UPGRADE_SMS_CRON_STRING`: Define the upgrade sms cron job

