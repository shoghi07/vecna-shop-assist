import crypto from 'crypto';

interface VertexCredentials {
    projectId: string;
    clientEmail: string;
    privateKey: string;
}

let cachedToken: string | null = null;
let tokenExpiry: number | null = null;

export function getVertexCredentials(): VertexCredentials | null {
    const projectId = process.env.GOOGLE_VERTEX_PROJECT_ID;
    const clientEmail = process.env.GOOGLE_VERTEX_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_VERTEX_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKey) {
        return null;
    }

    // Clean up private key if it has literal \n characters or creates issues
    const cleanKey = privateKey.replace(/\\n/g, '\n');

    return {
        projectId,
        clientEmail,
        privateKey: cleanKey
    };
}

export async function getVertexAccessToken(): Promise<string> {
    // Check cache
    if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
        return cachedToken;
    }

    const creds = getVertexCredentials();
    if (!creds) {
        throw new Error('Missing Vertex AI credentials');
    }

    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 3600; // 1 hour

    // 1. Create JWT Header
    const header = {
        alg: 'RS256',
        typ: 'JWT',
        kid: process.env.GOOGLE_VERTEX_PRIVATE_KEY_ID // Optional but good practice
    };

    // 2. Create JWT Claim Set
    const claimSet = {
        iss: creds.clientEmail,
        scope: 'https://www.googleapis.com/auth/cloud-platform',
        aud: 'https://oauth2.googleapis.com/token',
        exp: expiry,
        iat: now
    };

    // 3. Sign JWT
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedClaimSet = Buffer.from(JSON.stringify(claimSet)).toString('base64url');
    const signatureInput = `${encodedHeader}.${encodedClaimSet}`;

    const signer = crypto.createSign('RSA-SHA256');
    signer.update(signatureInput);
    const signature = signer.sign(creds.privateKey, 'base64url');

    const jwt = `${signatureInput}.${signature}`;

    // 4. Exchange JWT for Access Token
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get access token: ${response.status} ${errorText}`);
    }

    const data = await response.json();

    // Cache token (subtract 60s for safety buffer)
    cachedToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;

    return data.access_token;
}
