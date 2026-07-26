'use client';

import React, { useState, useRef, useEffect } from 'react';

export default function FloatingChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    
    const resetTimer = () => {
      clearTimeout(timeout);
      // Open after 60s of inactivity if not already opened and no messages yet
      if (!isOpen && messages.length === 0) {
        timeout = setTimeout(() => {
          setIsOpen(true);
          setMessages([{
            id: 'system-1', 
            role: 'assistant', 
            content: 'פסססט... 🍿 עוד מתלבט מה לראות? עם מינוי Elite כבר היית באמצע הסרט עכשיו. אבל היי, אני פה לעזור, במה תרצה שנדון היום? 😎'
          }]);
        }, 60000);
      }
    };

    // Track user activity
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keypress', resetTimer);
    window.addEventListener('click', resetTimer);
    window.addEventListener('scroll', resetTimer);
    
    resetTimer();

    return () => {
      clearTimeout(timeout);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keypress', resetTimer);
      window.removeEventListener('click', resetTimer);
      window.removeEventListener('scroll', resetTimer);
    };
  }, [isOpen, messages.length]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input || !input.trim()) return;

    const userMessage = { id: Date.now().toString(), role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, userMessage] })
      });

      if (!res.ok) throw new Error('API Error');

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      
      const loadingId = 'loading_' + Date.now();
      setMessages(prev => [...prev, { id: loadingId, role: 'assistant', content: '' }]);

      let assistantContent = '';
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          // Parse Vercel AI SDK Data Stream Protocol chunks (e.g., 0:"text"\n)
          const lines = chunk.split('\n').filter(Boolean);
          for (const line of lines) {
            if (line.startsWith('0:')) {
              try {
                const text = JSON.parse(line.substring(2));
                assistantContent += text;
                setMessages(prev => {
                  const newMsgs = [...prev];
                  newMsgs[newMsgs.length - 1] = { id: loadingId, role: 'assistant', content: assistantContent };
                  return newMsgs;
                });
              } catch (e) { /* ignore parse error for partial chunks */ }
            }
          }
        }
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { id: 'error', role: 'assistant', content: 'מצטער, חלה שגיאה בחיבור לשרת.' }]);
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div className="fixed bottom-6 right-6 z-30 font-sans" dir="rtl">
      {/* Chat Window — pinned bottom-RIGHT so it never overlaps the user avatar (bottom-left). */}
      {isOpen && (
        <div className="bg-[#111113] border border-zinc-800 rounded-2xl w-80 h-96 flex flex-col shadow-2xl mb-4 overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div className="bg-gradient-to-r from-indigo-600 to-rose-600 p-4 text-white font-bold flex justify-between items-center shadow-md">
            <span>תמיכה מהירה - CineMind 🍿</span>
            <button onClick={() => setIsOpen(false)} className="text-white/80 hover:text-white transition-colors">
              ✕
            </button>
          </div>
          
          <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-3 scrollbar-thin scrollbar-thumb-zinc-800">
            {messages.length === 0 && (
              <div className="text-zinc-500 text-sm text-center mt-4">
                איך אפשר לעזור לך היום? 😊
              </div>
            )}
            {messages.map((m, index) => (
              <div key={m.id ? m.id + '-' + index : index} className={`max-w-[85%] rounded-xl p-3 text-sm shadow-sm ${m.role === 'user' ? 'bg-indigo-600 text-white self-start rounded-br-none' : 'bg-zinc-800 text-zinc-200 self-end rounded-bl-none'}`}>
                {m.content}
              </div>
            ))}
            {isLoading && (
              <div className="text-zinc-500 text-xs self-end animate-pulse">מקליד...</div>
            )}
            {messages.length > 0 && <div ref={messagesEndRef} />}
          </div>

          <form 
            onSubmit={handleSendMessage}
            className="border-t border-zinc-800 p-3 bg-black"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="הקלד הודעה..."
              className="w-full bg-zinc-900 text-white rounded-xl px-4 py-2 outline-none focus:ring-1 focus:ring-rose-500 text-sm transition-all"
            />
          </form>
        </div>
      )}

      {/* Toggle Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 bg-gradient-to-tr from-indigo-600 to-rose-600 rounded-full flex items-center justify-center text-white text-2xl shadow-[0_5px_20px_rgba(225,29,72,0.4)] hover:scale-110 active:scale-95 transition-transform"
      >
        💬
      </button>
    </div>
  );
}
