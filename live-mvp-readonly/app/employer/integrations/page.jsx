"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, CheckCircle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import NaiveShell from "@/components/NaiveShell";
import api from "@/lib/api";

// ── SVG Brand Logos ───────────────────────────────────────────────
function ZohoLogo() {
  return (
    <svg viewBox="0 0 32 32" fill="none" className="w-4 h-4">
      <rect width="32" height="32" rx="6" fill="#E42527"/>
      <text x="16" y="22" textAnchor="middle" fill="white" fontSize="14" fontWeight="700" fontFamily="Arial">Z</text>
    </svg>
  );
}
function LeverLogo() {
  return (
    <svg viewBox="0 0 32 32" fill="none" className="w-4 h-4">
      <rect width="32" height="32" rx="6" fill="#000"/>
      <text x="16" y="22" textAnchor="middle" fill="white" fontSize="14" fontWeight="600" fontFamily="Arial">L</text>
    </svg>
  );
}
function DarwinboxLogo() {
  return (
    <svg viewBox="0 0 32 32" fill="none" className="w-4 h-4">
      <rect width="32" height="32" rx="6" fill="#FF6B35"/>
      <text x="16" y="22" textAnchor="middle" fill="white" fontSize="13" fontWeight="700" fontFamily="Arial">Dx</text>
    </svg>
  );
}
function GreenhouseLogo() {
  return (
    <svg viewBox="0 0 32 32" fill="none" className="w-4 h-4">
      <rect width="32" height="32" rx="6" fill="#24A148"/>
      <path d="M16 8C12.13 8 9 11.13 9 15c0 2.71 1.49 5.08 3.71 6.35V22h6.58v-.65C21.51 20.08 23 17.71 23 15c0-3.87-3.13-7-7-7z" fill="white"/>
    </svg>
  );
}
function AshbyLogo() {
  return (
    <svg viewBox="0 0 32 32" fill="none" className="w-4 h-4">
      <rect width="32" height="32" rx="6" fill="#1A1A2E"/>
      <text x="16" y="22" textAnchor="middle" fill="white" fontSize="13" fontWeight="700" fontFamily="Arial">A</text>
    </svg>
  );
}
function BambooLogo() {
  return (
    <svg viewBox="0 0 32 32" fill="none" className="w-4 h-4">
      <rect width="32" height="32" rx="6" fill="#79B829"/>
      <text x="16" y="22" textAnchor="middle" fill="white" fontSize="11" fontWeight="700" fontFamily="Arial">B</text>
    </svg>
  );
}
function SlackLogo() {
  return (
    <svg viewBox="0 0 32 32" fill="none" className="w-4 h-4">
      <rect width="32" height="32" rx="6" fill="#4A154B"/>
      <path d="M12.4 19.6c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2h2v2zm1 0c0-1.1.9-2 2-2s2 .9 2 2v5c0 1.1-.9 2-2 2s-2-.9-2-2v-5zm2-7.2c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2v2h-2zm0 1c1.1 0 2 .9 2 2s-.9 2-2 2h-5c-1.1 0-2-.9-2-2s.9-2 2-2h5zm7.2 2c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2h-2v-2zm-1 0c0 1.1-.9 2-2 2s-2-.9-2-2v-5c0-1.1.9-2 2-2s2 .9 2 2v5zm-2 7.2c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2v-2h2zm0-1c-1.1 0-2-.9-2-2s.9-2 2-2h5c1.1 0 2 .9 2 2s-.9 2-2 2h-5z" fill="white"/>
    </svg>
  );
}
function DiscordLogo() {
  return (
    <svg viewBox="0 0 32 32" fill="none" className="w-4 h-4">
      <rect width="32" height="32" rx="6" fill="#5865F2"/>
      <path d="M21.14 11.26C20.08 10.78 18.94 10.43 17.75 10.24c-.14.24-.3.57-.41.83a14.43 14.43 0 0 0-2.68 0c-.11-.26-.28-.59-.42-.83-1.19.19-2.33.54-3.39 1.02C9.07 14.54 8.34 17.77 8.67 21.01c1.37 1 2.72 1.61 4.04 2.01.33-.44.62-.91.87-1.41a9.4 9.4 0 0 1-1.37-.66c.12-.08.23-.17.34-.26a10.36 10.36 0 0 0 8.9 0c.11.09.22.18.34.26-.44.26-.9.48-1.38.67.25.5.54.97.87 1.41 1.32-.4 2.68-1.01 4.05-2.02.4-3.77-.67-7.05-2.2-9.75zM13.28 19.2c-.77 0-1.4-.7-1.4-1.55s.61-1.55 1.4-1.55c.78 0 1.41.7 1.4 1.55 0 .85-.62 1.55-1.4 1.55zm5.44 0c-.78 0-1.4-.7-1.4-1.55s.61-1.55 1.4-1.55c.78 0 1.41.7 1.4 1.55 0 .85-.62 1.55-1.4 1.55z" fill="white"/>
    </svg>
  );
}
function WhatsAppLogo() {
  return (
    <svg viewBox="0 0 32 32" fill="none" className="w-4 h-4">
      <rect width="32" height="32" rx="6" fill="#25D366"/>
      <path d="M16 7C11.04 7 7 11.04 7 16c0 1.73.47 3.35 1.3 4.74L7 25l4.42-1.28A8.97 8.97 0 0 0 16 25c4.96 0 9-4.04 9-9s-4.04-9-9-9zm4.36 12.57c-.18.5-1.05.98-1.46 1.03-.38.05-.86.07-1.38-.09-.32-.1-.73-.24-1.26-.47-2.2-.96-3.63-3.2-3.74-3.35-.11-.14-.9-1.2-.9-2.29 0-1.08.57-1.62.77-1.84.2-.22.44-.28.59-.28l.42.01c.14 0 .32-.05.5.38.19.44.63 1.53.69 1.64.06.11.1.24.02.39-.08.15-.12.24-.23.37-.12.13-.25.3-.35.4-.12.11-.24.24-.1.46.14.22.62.99 1.33 1.6.91.8 1.68 1.05 1.92 1.16.24.11.38.09.52-.05l.74-.82c.14-.16.28-.13.47-.05l1.5.7c.17.08.29.12.33.2.04.07.04.44-.14.95z" fill="white"/>
    </svg>
  );
}
function GmailLogo() {
  return (
    <svg viewBox="0 0 32 32" fill="none" className="w-4 h-4">
      <rect width="32" height="32" rx="6" fill="#EA4335"/>
      <path d="M22 10.5V21.5C22 22.33 21.33 23 20.5 23H19V13.39L16 16.58L13 13.39V23H9.5C8.67 23 8 22.33 8 21.5V10.5C8 9.33 9.38 8.75 10.21 9.53L16 15.3L21.79 9.53C22.62 8.75 24 9.33 24 10.5Z" fill="white" transform="scale(0.8) translate(4, 4)" />
    </svg>
  );
}

const LOGO_MAP = {
  zoho: ZohoLogo, lever: LeverLogo, darwinbox: DarwinboxLogo,
  greenhouse: GreenhouseLogo, ashby: AshbyLogo, bamboohr: BambooLogo,
  slack: SlackLogo, discord: DiscordLogo, whatsapp: WhatsAppLogo,
  gmail: GmailLogo,
};

const ATS_INTEGRATIONS = [
  { id: "zoho",       name: "Zoho Recruit",  desc: "Push verified shortlists to Zoho Recruit",  status: "available", category: "ats" },
  { id: "lever",      name: "Lever",          desc: "Sync candidates and stages with Lever",      status: "available", category: "ats" },
  { id: "darwinbox",  name: "Darwinbox",      desc: "Connect to Darwinbox HR platform",           status: "available", category: "ats" },
  { id: "greenhouse", name: "Greenhouse",     desc: "Two-way sync with Greenhouse",               status: "coming",    category: "ats" },
  { id: "ashby",      name: "Ashby",          desc: "Push shortlists to Ashby",                  status: "coming",    category: "ats" },
  { id: "bamboohr",   name: "BambooHR",       desc: "Connect HR data to BambooHR",               status: "coming",    category: "ats" },
];
const NOTIFICATION_CHANNELS = [
  { id: "slack",    name: "Slack",    desc: "Pipeline events to your Slack channels",      status: "available" },
  { id: "discord",  name: "Discord",  desc: "Alerts to your team's Discord server",        status: "available" },
  { id: "whatsapp", name: "WhatsApp", desc: "Status updates via WhatsApp Business",        status: "available" },
];
const COMMUNICATION_CHANNELS = [
  { id: "gmail",    name: "Gmail",    desc: "Send outreach and schedule interviews via Gmail",  status: "available" },
];

function IntegrationRow({ item, connected, onToggle }) {
  const Logo = LOGO_MAP[item.id];
  const isConnected = !!connected[item.id];
  const isComing = item.status === "coming";
  return (
    <div className="flex items-center gap-3 px-5 py-3.5 hover:bg-white/[0.02] transition-colors group">
      <div className="w-8 h-8 rounded-lg overflow-hidden bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0">
        {Logo ? <Logo /> : <div className="w-4 h-4 rounded bg-white/20" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[13px] font-medium text-white/70">{item.name}</p>
          {isComing && <Badge variant="outline" className="text-[8px] font-mono h-4 px-1.5 text-white/25 border-white/[0.06]">SOON</Badge>}
          {isConnected && <Badge variant="outline" className="text-[8px] font-mono h-4 px-1.5 text-green-400/70 border-green-500/[0.15] bg-green-500/[0.06]">ACTIVE</Badge>}
        </div>
        <p className="text-[10px] text-white/30 mt-0.5 truncate">{item.desc}</p>
      </div>
      {!isComing && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => onToggle(item.id, item.name)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] border transition-all duration-150 ${
                isConnected
                  ? "border-white/[0.08] text-white/40 hover:text-white/65 hover:border-white/[0.14]"
                  : "border-white/[0.09] text-white/50 hover:text-white/80 hover:border-white/[0.18] hover:bg-white/[0.04]"
              }`}
            >
              {isConnected ? "Disconnect" : "Connect"}
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">
            {isConnected ? `Disconnect ${item.name}` : `Connect ${item.name}`}
          </TooltipContent>
        </Tooltip>
      )}
      {isComing && (
        <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.05] text-[11px] text-white/20">
          <Clock className="h-3 w-3" /> Coming
        </div>
      )}
    </div>
  );
}

export default function IntegrationsPage() {
  const router = useRouter();
  const [connected, setConnected] = useState({});
  const [activeTab, setActiveTab] = useState("ats");
  const [isGmailConnecting, setIsGmailConnecting] = useState(false);

  useEffect(() => {
    debugger;
    // Handle redirect success/error from Google
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'gmail_connected') {
      toast.success("Gmail connected and authorized!");
      setConnected(c => ({ ...c, gmail: true }));
      // Clean up URL
      router.replace('/employer/integrations');
    }
    if (params.get('error')) {
      toast.error(`Connection failed: ${params.get('error')}`);
      router.replace('/employer/integrations');
    }
  }, [router]);

  const handleToggle = async (id, name) => {
    if (id === 'gmail') {
      if (connected[id]) {
          // In a real app, you'd call a disconnect API here
          setConnected(c => ({ ...c, [id]: false }));
          toast.info("Gmail disconnected locally");
          return;
      }

      setIsGmailConnecting(true);
      try {
        const res = await api.get('/integrations/gmail/connect');
        if (res.data.url) {
          window.location.href = res.data.url;
        } else {
          throw new Error("No URL returned");
        }
      } catch (err) {
        toast.error("Failed to start Google connection. Check your Client ID.");
        setIsGmailConnecting(false);
      }
      return;
    }

    setConnected(c => ({ ...c, [id]: !c[id] }));
    toast.success(connected[id] ? `${name} disconnected` : `${name} connected`);
  };

  const tabs = [
    { id: "ats",    label: "ATS Platforms" },
    { id: "comm",   label: "Communication" },
    { id: "notify", label: "Notifications" },
    { id: "config", label: "Config" },
  ];

  const activeIntegrations = Object.values(connected).filter(Boolean).length;

  const rightPanel = (
    <div className="px-4 py-4 space-y-4">
      <div>
        <p className="mono-label mb-2">CONNECTED</p>
        <p className="text-[24px] font-mono font-semibold text-white/75">{activeIntegrations}</p>
        <p className="text-[10px] text-white/25">active integrations</p>
      </div>
      <div className="space-y-1.5">
        {[...ATS_INTEGRATIONS, ...NOTIFICATION_CHANNELS].filter(i => connected[i.id]).map(i => {
          const Logo = LOGO_MAP[i.id];
          return (
            <div key={i.id} className="flex items-center gap-2">
              <div className="w-4 h-4 rounded overflow-hidden shrink-0">
                {Logo ? <Logo /> : <div className="w-full h-full bg-white/20 rounded" />}
              </div>
              <p className="text-[11px] text-white/50 truncate">{i.name}</p>
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0 ml-auto" />
            </div>
          );
        })}
        {activeIntegrations === 0 && <p className="text-[10px] text-white/20">None connected yet</p>}
      </div>
    </div>
  );

  return (
    <NaiveShell
      pageTitle="Integrations"
      pageSubtitle="Connect ATS platforms and notification services"
      rightPanel={rightPanel}
      rightPanelTitle="Connected"
      data-testid="integrations-page"
      topBar={
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-white/20" />
          <input
            placeholder="Search integrations…"
            className="naive-input pl-7 pr-3 py-1.5 w-[180px]"
          />
        </div>
      }
    >
      <div className="px-6 py-5">
        {/* Tab bar */}
        <div className="flex items-center gap-1 mb-6">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 ${
                activeTab === tab.id
                  ? "bg-white/[0.07] text-white/80 border border-white/[0.08]"
                  : "text-white/35 hover:text-white/60 hover:bg-white/[0.04] border border-transparent"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ATS */}
        {activeTab === "ats" && (
          <div className="animate-fade-in">
            <p className="mono-label mb-3">ATS / HR PLATFORMS</p>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden divide-y divide-white/[0.04]">
              {ATS_INTEGRATIONS.map(item => (
                <IntegrationRow key={item.id} item={item} connected={connected} onToggle={handleToggle} />
              ))}
            </div>
          </div>
        )}

        {/* Communication */}
        {activeTab === "comm" && (
          <div className="animate-fade-in">
            <p className="mono-label mb-3">COMMUNICATION CHANNELS</p>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden divide-y divide-white/[0.04]">
              {COMMUNICATION_CHANNELS.map(item => (
                <IntegrationRow key={item.id} item={item} connected={connected} onToggle={handleToggle} />
              ))}
            </div>
          </div>
        )}

        {/* Notifications */}
        {activeTab === "notify" && (
          <div className="animate-fade-in">
            <p className="mono-label mb-3">NOTIFICATION CHANNELS</p>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden divide-y divide-white/[0.04]">
              {NOTIFICATION_CHANNELS.map(item => (
                <IntegrationRow key={item.id} item={item} connected={connected} onToggle={handleToggle} />
              ))}
            </div>
          </div>
        )}

        {/* Config */}
        {activeTab === "config" && (
          <div className="animate-fade-in space-y-4">
            <p className="mono-label mb-3">ENVIRONMENT VARIABLES</p>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <p className="text-[12px] text-white/45 leading-relaxed mb-4">
                CareerTWiN sends real-time events to connected channels via webhooks. Set the following environment variables in your Docker or hosting environment:
              </p>
              <div className="space-y-2">
                {[
                  { key: "SLACK_WEBHOOK_URL",    desc: "Incoming webhook from Slack Apps" },
                  { key: "DISCORD_WEBHOOK_URL",   desc: "Server webhook URL from Discord" },
                  { key: "TWILIO_ACCOUNT_SID",    desc: "Twilio account SID for WhatsApp" },
                  { key: "TWILIO_AUTH_TOKEN",      desc: "Twilio auth token" },
                  { key: "TWILIO_WHATSAPP_FROM",   desc: "Twilio WhatsApp sender number" },
                  { key: "GEMINI_API_KEY",         desc: "Google Gemini for AI features" },
                ].map(v => (
                  <div key={v.key} className="flex items-center gap-3">
                    <code className="px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/[0.06] text-[10px] font-mono text-white/45 shrink-0">
                      {v.key}
                    </code>
                    <span className="text-[10px] text-white/25">{v.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </NaiveShell>
  );
}
