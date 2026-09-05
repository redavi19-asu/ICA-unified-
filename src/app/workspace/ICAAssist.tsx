'use client';

import { FormEvent, useState } from 'react';

type Message = { role: 'user' | 'assistant'; text: string };

export default function ICAAssist() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      text: 'Hi — I’m ICA Assist. Ask me how to set up a membership, registration, event, webinar, CEU workflow, member record, import, or another ICA Unified task.',
    },
  ]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const question = input.trim();
    if (!question || thinking) return;

    setMessages((current) => [...current, { role: 'user', text: question }]);
    setInput('');
    setThinking(true);

    try {
      const response = await fetch('/api/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const data = await response.json();
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          text: response.ok ? data.answer : (data.error || 'I could not answer that right now.'),
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        { role: 'assistant', text: 'I could not reach the help service. Try again in a moment.' },
      ]);
    } finally {
      setThinking(false);
    }
  }

  return (
    <>
      <button className="ica-assist-launcher" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span>✦</span>
        <strong>ICA Assist</strong>
      </button>

      {open && (
        <section className="ica-assist-panel" aria-label="ICA Assist">
          <header>
            <div>
              <small>ICA UNIFIED HELP DESK</small>
              <strong>ICA Assist</strong>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close ICA Assist">×</button>
          </header>

          <div className="ica-assist-messages">
            {messages.map((message, index) => (
              <div key={index} className={message.role === 'user' ? 'ica-assist-user' : 'ica-assist-answer'}>
                <small>{message.role === 'user' ? 'YOU' : 'ICA ASSIST'}</small>
                <p>{message.text}</p>
              </div>
            ))}
            {thinking && (
              <div className="ica-assist-answer ica-assist-thinking">
                <small>ICA ASSIST</small>
                <p>Thinking…</p>
              </div>
            )}
          </div>

          <form onSubmit={send}>
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="How do I set up an event?"
              aria-label="Ask ICA Assist"
            />
            <button disabled={thinking || !input.trim()}>Send</button>
          </form>
          <footer>ICA-specific instructions • No generic LMS/AMS runaround</footer>
        </section>
      )}
    </>
  );
}
