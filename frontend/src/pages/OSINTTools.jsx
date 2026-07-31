import React from 'react';

const OSINTTools = () => {
  return (
    <div className="w-full h-screen">
      <iframe
        src="/osint/"
        title="OSINT Tools Portal"
        className="w-full h-full border-0"
        style={{ minHeight: 'calc(100vh - 64px)' }}
        allow="clipboard-write"
      />
    </div>
  );
};

export default OSINTTools;
