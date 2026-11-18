# Optional AWS Transfer Family SFTP landing

`template.yaml` defines a distinct public AWS Transfer Family SFTP server with service-managed identities for the exact partner names `MONTYXLABEL.cyou` and `smusicdistrition.com`. Each partner has a separate home directory and prefix in the existing private S3 bucket. A partner receives SFTP access only if its public-key parameter is supplied. No user/key or AWS resource is provisioned by this repository change.

This template is a landing endpoint, not an end-to-end distribution integration. It does not validate DDEX ERN, transfer staged files into the API's multipart workflow, issue an app receipt, or publish catalogue records. A separate authenticated S3 event/processing worker and real partner agreement/test are required before describing SFTP as an active ingestion interface.

Review IAM scope, bucket policy, host key/DNS pinning, encryption, S3 lifecycle/versioning, CloudWatch retention and expected Transfer Family/data-transfer cost before stack deployment. Never paste a partner's private key; the template accepts only the partner's public key. Leave both key parameters empty until the partner authorizes SFTP and provides its public key.
