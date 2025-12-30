
// Native fetch is available in Node 18+

async function testLongHistory() {
    const history = [];
    const sessionId = 'debug-' + Date.now();

    // Simulate 12 turns
    for (let i = 0; i < 12; i++) {
        console.log(`\n--- Turn ${i + 1} ---`);
        const userMsg = i % 2 === 0 ? "I'm looking for a camera for my trip to Japan." : "I need something compact but high quality.";

        console.log("Sending:", userMsg);

        try {
            const res = await fetch('http://localhost:3000/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: sessionId,
                    current_message: userMsg,
                    chat_history: history
                })
            });

            if (!res.ok) {
                console.error("FAILED status:", res.status);
                const text = await res.text();
                console.error("Error body:", text);
                // Do not break immediately, let's see if it recovers? No, usually 500 is fatal for that request.
                break;
            }

            const data = await res.json();
            console.log("Response Type:", data.response_type);
            console.log("Confidence:", data.confidence);

            // Update history
            history.push({ role: 'user', content: userMsg });
            // Depending on response type, structure might vary
            let content = "";
            if (data.response_type === 'clarification') {
                content = data.clarifying_question;
            } else {
                content = data.explanation;
            }
            history.push({ role: 'assistant', content: content });

        } catch (e) {
            console.error("Request failed:", e);
            break;
        }
    }
}

testLongHistory();
