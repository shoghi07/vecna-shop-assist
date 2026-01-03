import { NextResponse } from 'next/server';

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

export async function POST(req: Request) {
    try {
        const apiKey = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY;

        if (!apiKey) {
            return NextResponse.json(
                { error: 'ElevenLabs API key not configured' },
                { status: 500 }
            );
        }

        const { text, voiceId } = await req.json();

        if (!text) {
            return NextResponse.json(
                { error: 'No text provided' },
                { status: 400 }
            );
        }

        const targetVoiceId = voiceId || '21m00Tcm4TlvDq8ikWAM'; // Default to Rachel

        // Forward to ElevenLabs API
        const response = await fetch(
            `${ELEVENLABS_API_BASE}/text-to-speech/${targetVoiceId}`,
            {
                method: 'POST',
                headers: {
                    'Accept': 'audio/mpeg',
                    'Content-Type': 'application/json',
                    'xi-api-key': apiKey,
                },
                body: JSON.stringify({
                    text,
                    model_id: 'eleven_flash_v2_5',
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.75,
                    },
                }),
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error('ElevenLabs TTS error:', response.status, errorText);
            return NextResponse.json(
                { error: `Text-to-speech failed: ${response.status}` },
                { status: response.status }
            );
        }

        // Return the audio blob
        const audioBuffer = await response.arrayBuffer();

        return new NextResponse(audioBuffer, {
            headers: {
                'Content-Type': 'audio/mpeg',
            },
        });

    } catch (error) {
        console.error('TTS API error:', error);
        return NextResponse.json(
            { error: 'Text-to-speech failed' },
            { status: 500 }
        );
    }
}
