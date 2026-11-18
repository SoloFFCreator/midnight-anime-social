import test from 'node:test'
import assert from 'node:assert/strict'
import { assetSpec, authenticatePartner, getPartnerConfig, parseErn } from '../../api/_distribution.js'

const xml = `<ern:NewReleaseMessage xmlns:ern="http://ddex.net/xml/ern/43">
  <MessageHeader><MessageId>message-001</MessageId></MessageHeader>
  <ResourceList><SoundRecording><ResourceReference>A1</ResourceReference><SoundRecordingId><ISRC>USABC1234567</ISRC></SoundRecordingId></SoundRecording></ResourceList>
  <ReleaseList><Release><ReferenceTitle><TitleText>Midnight Signal</TitleText></ReferenceTitle><ReleaseId><ICPN>123456789012</ICPN></ReleaseId><ReleaseDisplayArtist><DisplayArtistName>Test Artist</DisplayArtistName></ReleaseDisplayArtist><ReleaseType>Album</ReleaseType><ReleaseDate>2027-01-01</ReleaseDate><TerritoryCode>WORLDWIDE</TerritoryCode><Genre><GenreText>Pop</GenreText></Genre></Release></ReleaseList>
</ern:NewReleaseMessage>`

test('parses an ERN 4.3 namespace and the supported identifiers/metadata', () => {
  const result = parseErn(xml)
  assert.equal(result.namespace, 'ern/43')
  assert.equal(result.exactSchemaVersion, null)
  assert.equal(result.messageId, 'message-001')
  assert.equal(result.title, 'Midnight Signal')
  assert.deepEqual(result.artistNames, ['Test Artist'])
  assert.deepEqual(result.upcs, ['123456789012'])
  assert.deepEqual(result.isrcs, ['USABC1234567'])
  assert.deepEqual(result.territories, ['WORLDWIDE'])
  assert.equal(result.schemaValidation.state, 'pending')
})

test('rejects unsafe entity declarations and malformed XML', () => {
  assert.throws(() => parseErn(xml.replace('<MessageHeader>', '<!DOCTYPE x [<!ENTITY y SYSTEM "file:///etc/passwd">]><MessageHeader>')), /DTD, entity/)
  assert.throws(() => parseErn(xml.replace('</ern:NewReleaseMessage>', '')), /Malformed XML/)
})

test('rejects unsupported ERN namespace versions and missing message IDs', () => {
  assert.throws(() => parseErn(xml.replace('/ern/43', '/ern/42')), /Only DDEX ERN 4.3-family/)
  assert.throws(() => parseErn(xml.replace('<MessageId>message-001</MessageId>', '')), /MessageHeader\/MessageId/)
})

test('enforces role, media types, per-file 10 GB audio and artwork limits', () => {
  const audio = assetSpec({ role: 'audio', contentType: 'audio/flac', size: 10_000_000_000, resourceReference: 'A1' }, 0)
  assert.equal(audio.size, 10_000_000_000)
  assert.throws(() => assetSpec({ role: 'audio', contentType: 'audio/flac', size: 10_000_000_001 }, 0), /size must/)
  assert.throws(() => assetSpec({ role: 'artwork', contentType: 'image/svg+xml', size: 1200 }, 0), /Unsupported artwork/)
  assert.throws(() => assetSpec({ role: 'artwork', contentType: 'image/jpeg', size: 25_000_001 }, 0), /size must/)
})

test('only exact named partners with explicitly enabled high-entropy API keys authenticate', () => {
  const previous = process.env.MUSIC_DISTRIBUTION_PARTNERS_JSON
  delete process.env.MUSIC_DISTRIBUTION_PARTNERS_JSON
  assert.equal(getPartnerConfig('montyxlabel'), null)
  assert.equal(authenticatePartner({ headers: { authorization: 'Bearer not-a-token' } }, 'montyxlabel'), null)
  const token = 'a'.repeat(64)
  process.env.MUSIC_DISTRIBUTION_PARTNERS_JSON = JSON.stringify({ montyxlabel: { enabled: true, apiToken: token }, unrelated: { enabled: true, apiToken: token } })
  assert.ok(authenticatePartner({ headers: { authorization: `Bearer ${token}` } }, 'montyxlabel'))
  assert.equal(authenticatePartner({ headers: { authorization: `Bearer ${token}` } }, 'unrelated'), null)
  assert.equal(authenticatePartner({ headers: { authorization: 'Bearer wrong-token' } }, 'montyxlabel'), null)
  if (previous === undefined) delete process.env.MUSIC_DISTRIBUTION_PARTNERS_JSON
  else process.env.MUSIC_DISTRIBUTION_PARTNERS_JSON = previous
})
