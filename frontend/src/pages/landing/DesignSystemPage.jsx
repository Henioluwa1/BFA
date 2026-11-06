import React from 'react';
import PublicTopNav from '../../components/public/PublicTopNav';
import DesignSystemShowcase from '../../components/public/DesignSystemShowcase';
import FloatingChatWidget from '../../components/public/FloatingChatWidget';
import '../../styles/hospitalityTokens.css';

export default function DesignSystemPage() {
  return (
    <div className="bfa-hospitality-scope" style={{ minHeight: '100vh', backgroundColor: '#fbf9f5' }}>
      <PublicTopNav activeTab="design" onOpenBooking={() => {}} />
      <main style={{ paddingTop: '80px' }}>
        <DesignSystemShowcase />
      </main>
      <FloatingChatWidget onOpenBooking={() => {}} />
    </div>
  );
}

