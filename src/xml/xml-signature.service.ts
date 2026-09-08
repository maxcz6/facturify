import { BadRequestException, Injectable } from '@nestjs/common';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { SignedXml } from 'xml-crypto';

export interface XmlSigningMaterial {
  privateKeyPem: string | Buffer;
  certificatePem: string | Buffer;
  signatureId: string;
}

@Injectable()
export class XmlSignatureService {
  sign(unsignedXml: string, material: XmlSigningMaterial): string {
    if (!unsignedXml.includes('ext:ExtensionContent')) {
      throw new BadRequestException('UBL XML does not contain an ExtensionContent signature container.');
    }
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(material.signatureId)) {
      throw new BadRequestException('Invalid XML signature identifier.');
    }

    // Parse the keys early so malformed or mismatched material fails before XML processing.
    const privateKey = createPrivateKey(material.privateKeyPem);
    const publicKey = this.resolvePublicKey(material.certificatePem);
    if (!privateKey.asymmetricKeyType?.startsWith('rsa') || !publicKey.asymmetricKeyType?.startsWith('rsa')) {
      throw new BadRequestException('Facturify currently supports RSA signing certificates only.');
    }

    const signature = new SignedXml({
      privateKey,
      publicCert: material.certificatePem,
      signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
      canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315#WithComments',
      getKeyInfoContent: SignedXml.getKeyInfoContent,
    });

    signature.addReference({
      xpath: '/*',
      transforms: [
        'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
        'http://www.w3.org/TR/2001/REC-xml-c14n-20010315#WithComments',
      ],
      digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
      uri: '',
      isEmptyUri: true,
    });

    signature.computeSignature(unsignedXml, {
      prefix: 'ds',
      attrs: { Id: material.signatureId },
      location: {
        reference: "//*[local-name(.)='ExtensionContent']",
        action: 'append',
      },
      existingPrefixes: {
        ext: 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
      },
    });

    return signature.getSignedXml();
  }

  verify(signedXml: string, certificatePem: string | Buffer): boolean {
    const signatureXml = signedXml.match(/<ds:Signature\b[\s\S]*?<\/ds:Signature>/)?.[0];
    if (!signatureXml) return false;

    const verifier = new SignedXml({
      publicCert: certificatePem,
      getCertFromKeyInfo: () => null,
    });
    verifier.loadSignature(signatureXml);
    return verifier.checkSignature(signedXml);
  }

  private resolvePublicKey(certificateOrPublicKey: string | Buffer) {
    try {
      return createPublicKey(certificateOrPublicKey);
    } catch {
      throw new BadRequestException('Invalid signing certificate or public key.');
    }
  }
}
