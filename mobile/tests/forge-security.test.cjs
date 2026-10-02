const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, privateEncrypt, constants, createHash } = require('node:crypto');
const forge = require('node-forge');
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 1024 });
const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
const key = forge.pki.publicKeyFromPem(publicPem);
const digest = createHash('sha256').update('ICA mobile certificate verification regression').digest();
const { asn1 } = forge;
function signature(extraChild) {
  const children = [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(forge.pki.oids.sha256).getBytes()),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, ''),
  ];
  if (extraChild) children.push(asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, 'unconsumed data'));
  const info = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, children),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, digest.toString('binary')),
  ]);
  return privateEncrypt({ key: privateKey, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(asn1.toDer(info).getBytes(), 'binary')).toString('binary');
}
test('valid RSA PKCS#1 v1.5 signatures still verify', () => {
  assert.equal(key.verify(digest.toString('binary'), signature(false)), true);
});
test('nested DigestAlgorithm garbage is rejected', () => {
  assert.throws(() => key.verify(digest.toString('binary'), signature(true)), /DigestInfo/);
});
test('modified message digest is rejected', () => {
  assert.equal(key.verify(createHash('sha256').update('different message').digest('binary'), signature(false)), false);
});
test('Xcode project ID generation remains compatible with patched uuid', () => {
  const project = require('xcode').project('test.pbxproj');
  project.hash = { project: { objects: {} } };
  const id = project.generateUuid();
  assert.match(id, /^[A-F0-9]{24}$/);
});
