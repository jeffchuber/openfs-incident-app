"use client";

import { useChat } from "@ai-sdk/react";
import { useRef, useEffect } from "react";
import { ToolResult } from "./tool-result";

export function ChatPanel() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, error } =
    useChat({
      api: "/api/chat",
      maxSteps: 10,
    });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex-1 flex flex-col min-h-0 border-b border-[var(--border)]">
      <div className="px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-dim)] bg-[var(--bg-panel)] border-b border-[var(--border)] shrink-0">
        Claude Copilot
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3.5 py-2 space-y-3">
        {messages.length === 0 && (
          <div className="text-[var(--text-dim)] text-sm italic">
            Ask Claude to help investigate the incident. Try: &quot;What&apos;s the current P1 incident?&quot;
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id}>
            {msg.role === "user" && (
              <div className="flex gap-2">
                <span className="text-[var(--green)] font-bold text-xs shrink-0 mt-0.5">you</span>
                <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
              </div>
            )}
            {msg.role === "assistant" && (
              <div className="flex gap-2">
                <span className="text-[var(--cyan)] font-bold text-xs shrink-0 mt-0.5">claude</span>
                <div className="flex-1 min-w-0">
                  {msg.parts?.map((part, i) => {
                    if (part.type === "text" && part.text) {
                      return (
                        <div key={i} className="text-sm whitespace-pre-wrap">
                          {part.text}
                        </div>
                      );
                    }
                    if (part.type === "tool-invocation") {
                      const inv = part as any;
                      return (
                        <ToolResult
                          key={i}
                          toolName={inv.toolInvocation.toolName}
                          args={inv.toolInvocation.args}
                          result={inv.toolInvocation.result}
                        />
                      );
                    }
                    return null;
                  }) ?? (
                    <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex items-center gap-2 text-[var(--text-dim)] text-sm">
            <div className="w-3 h-3 border-2 border-[var(--border)] border-t-[var(--cyan)] rounded-full animate-spin" />
            thinking...
          </div>
        )}
        {error && (
          <div className="text-[var(--red)] text-sm">
            Error: {error.message}
          </div>
        )}
      </div>
      <form onSubmit={handleSubmit} className="flex items-center px-3.5 py-1.5 bg-[var(--bg-panel)] border-t border-[var(--border)] gap-1.5 shrink-0">
        <span className="text-[var(--cyan)] font-bold shrink-0 text-xs">ask</span>
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Ask Claude about the incident..."
          disabled={isLoading}
          className="flex-1 bg-transparent border-none outline-none text-[var(--text-bright)] font-mono text-[13px] caret-[var(--cyan)] placeholder:text-[var(--text-dim)]"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="text-[11px] px-2 py-0.5 bg-[var(--cyan)] text-[var(--bg)] rounded font-semibold disabled:opacity-30 cursor-pointer"
        >
          Send
        </button>
      </form>
    </div>
  );
}
