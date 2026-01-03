import { NextResponse } from 'next/server';

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

export async function POST(req: Request) {
    try {
        const apiKey = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY;

        if (!apiKey) {
            console.error('ElevenLabs API key not configured');
            return NextResponse.json(
                { error: 'ElevenLabs API key not configured' },
                { status: 500 }
            );
        }

        // Get the audio file from the request
        const formData = await req.formData();
        const audioFile = formData.get('audio');

        console.log('Received audio file:', {
            hasFile: !!audioFile,
            type: audioFile instanceof Blob ? audioFile.type : 'not a blob',
            size: audioFile instanceof Blob ? audioFile.size : 0
        });

        if (!audioFile || !(audioFile instanceof Blob)) {
            console.error('No valid audio file provided');
            return NextResponse.json(
                { error: 'No audio file provided' },
                { status: 400 }
            );
        }

        // Forward to ElevenLabs API
        const elevenLabsFormData = new FormData();
        elevenLabsFormData.append('file', audioFile, 'recording.webm'); // Changed from 'audio' to 'file'
        elevenLabsFormData.append('model_id', 'scribe_v1');

        console.log('Sending to ElevenLabs API...');

        const response = await fetch(`${ELEVENLABS_API_BASE}/speech-to-text`, {
            method: 'POST',
            headers: {
                'xi-api-key': apiKey,
            },
            body: elevenLabsFormData,
        });

        console.log('ElevenLabs response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('ElevenLabs STT error:', {
                status: response.status,
                statusText: response.statusText,
                body: errorText
            });
            return NextResponse.json(
                { error: `Transcription failed: ${errorText}` },
                { status: response.status }
            );
        }

        const data = await response.json();
        console.log('ElevenLabs response:', data);

        return NextResponse.json({ text: data.text });

    } catch (error) {
        console.error('Transcription API error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Transcription failed' },
            { status: 500 }
        );
    }
}
