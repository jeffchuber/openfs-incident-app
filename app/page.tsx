"use client";

import { useState, useCallback } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { FileExplorer } from "@/components/file-explorer";
import { FileViewer } from "@/components/file-viewer";
import { ChatPanel } from "@/components/chat-panel";
import { Terminal } from "@/components/terminal";

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleCommandRun = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const handleCat = useCallback((path: string) => {
    // This is a simplified version — in a full implementation we'd
    // programmatically run the command in the terminal
  }, []);

  return (
    <LayoutShell>
      {/* Left sidebar — file explorer */}
      <FileExplorer
        onSelectFile={setSelectedFile}
        selectedPath={selectedFile}
        refreshKey={refreshKey}
      />

      {/* Right side — chat + terminal */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* File viewer (shown when file selected) */}
        {selectedFile && (
          <FileViewer
            path={selectedFile}
            onClose={() => setSelectedFile(null)}
            onCat={handleCat}
          />
        )}

        {/* Chat panel */}
        <ChatPanel />

        {/* Terminal */}
        <Terminal onCommandRun={handleCommandRun} />
      </div>
    </LayoutShell>
  );
}
