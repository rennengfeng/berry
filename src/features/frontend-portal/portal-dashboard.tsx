import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/stores/auth-store";
import { useStatus } from "@/hooks/use-status";
import { getSelf } from "@/lib/api";
import { formatQuota, formatNumber } from "@/lib/format";
import { getRoleLabel } from "@/lib/roles";
import { BarChart3, Activity, Users, Bell, Globe, Code2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import dayjs from "dayjs";
import { pickLang } from "@/lib/multilang";
import { CopyButton } from "@/components/copy-button";
import {
  CodeBlock,
  CodeBlockCopyButton,
} from "@/components/ai-elements/code-block";

type ApiInfoItem = {
  url: string;
  route: string;
  description: string;
  color: string;
};

type ApiExampleLanguage = "curl" | "python" | "typescript";

type ApiExampleDefinition = {
  nameKey: string;
  nameFallback: string;
  descKey: string;
  descFallback: string;
  color: string;
  examples: Record<ApiExampleLanguage, string>;
};

function normalizeBaseUrl(url: string) {
  return url.replace(/\/$/, "");
}

function buildApiExamples(baseUrl: string): ApiExampleDefinition[] {
  const apiBase = normalizeBaseUrl(baseUrl || "https://api.example.com/v1");
  const geminiBase = apiBase.endsWith("/v1")
    ? apiBase.replace(/\/v1$/, "/v1beta")
    : `${apiBase}/v1beta`;

  return [
    {
      nameKey: "portal.notice.sdk.openai",
      nameFallback: "OpenAI",
      descKey: "portal.notice.sdk.openai.desc",
      descFallback: "Compatible with OpenAI SDK.",
      color: "#059669",
      examples: {
        curl: `curl "${apiBase}/chat/completions" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hello!"}]}'`,
        python: `from openai import OpenAI

client = OpenAI(
    api_key="YOUR_API_KEY",
    base_url="${apiBase}"
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role":"user", "content":"Hello!"}]
)
print(response.choices[0].message.content)`,
        typescript: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "YOUR_API_KEY",
  baseURL: "${apiBase}"
});

const res = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello!" }]
});
console.log(res.choices[0].message.content);`,
      },
    },
    {
      nameKey: "portal.notice.sdk.anthropic",
      nameFallback: "Anthropic",
      descKey: "portal.notice.sdk.anthropic.desc",
      descFallback: "Compatible with Anthropic SDK.",
      color: "#7c3aed",
      examples: {
        curl: `curl "${apiBase}/messages" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"claude-opus-4-8","max_tokens":1024,"messages":[{"role":"user","content":"Hello!"}]}'`,
        python: `from anthropic import Anthropic

client = Anthropic(
    api_key="YOUR_API_KEY",
    base_url="${apiBase}"
)

msg = client.messages.create(
    model="claude-opus-4-8",
    max_tokens=1024,
    messages=[{"role":"user", "content":"Hello!"}]
)
print(msg.content[0].text)`,
        typescript: `import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: "YOUR_API_KEY",
  baseURL: "${apiBase}"
});

const msg = await client.messages.create({
  model: "claude-opus-4-8",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Hello!" }]
});
console.log(msg.content[0].text);`,
      },
    },
    {
      nameKey: "portal.notice.sdk.gemini",
      nameFallback: "Gemini",
      descKey: "portal.notice.sdk.gemini.desc",
      descFallback: "Compatible with Gemini API.",
      color: "#ea580c",
      examples: {
        curl: `curl "${geminiBase}/models/gemini-2.0-flash:generateContent?key=YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"contents":[{"parts":[{"text":"Hello!"}]}]}'`,
        python: `import google.generativeai as genai

genai.configure(api_key="YOUR_API_KEY")
# base_url: ${geminiBase}

model = genai.GenerativeModel("gemini-2.0-flash")
response = model.generate_content("Hello!")
print(response.text)`,
        typescript: `import { GoogleGenerativeAI } from "@google/generative-ai";

// base_url: ${geminiBase}
const genAI = new GoogleGenerativeAI("YOUR_API_KEY");
const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash"
});

const result = await model.generateContent("Hello!");
console.log(result.response.text());`,
      },
    },
  ];
}

function ApiExampleCard({ example }: { example: ApiExampleDefinition }) {
  const [lang, setLang] = useState<ApiExampleLanguage>("curl");
  const { t } = useTranslation();

  return (
    <div className="rounded-lg border border-border/40 bg-muted/20 p-4">
      <div className="mb-2 font-semibold" style={{ color: example.color }}>
        {t(example.nameKey, example.nameFallback)}
      </div>
      <div className="mb-3 text-xs text-muted-foreground">
        {t(example.descKey, example.descFallback)}
      </div>
      <div className="mb-3 flex gap-2">
        {(["curl", "python", "typescript"] as const).map((itemLang) => (
          <button
            key={itemLang}
            type="button"
            onClick={() => setLang(itemLang)}
            className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition ${
              lang === itemLang
                ? "border border-primary/30 bg-primary/10 text-primary"
                : "border border-border/60 bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            {itemLang === "curl"
              ? "cURL"
              : itemLang === "python"
                ? "Python"
                : "TypeScript"}
          </button>
        ))}
      </div>
      <div className="relative">
        <CodeBlock
          code={example.examples[lang]}
          language={
            lang === "curl"
              ? "bash"
              : lang === "typescript"
                ? "typescript"
                : "python"
          }
          className="text-xs"
        >
          <CodeBlockCopyButton size="sm" />
        </CodeBlock>
      </div>
    </div>
  );
}

export function PortalDashboard() {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.auth.user);
  const setUser = useAuthStore((s) => s.auth.setUser);
  const { status } = useStatus();

  useEffect(() => {
    getSelf()
      .then((res) => {
        if (res.success && res.data) {
          setUser(res.data as typeof user);
        }
      })
      .catch(() => {});
  }, [setUser]);

  const source = (status?.data ?? status) as
    | Record<string, unknown>
    | null
    | undefined;
  const announcementsEnabled = source?.announcements_enabled !== false;
  const announcements = (announcementsEnabled ? source?.announcements : []) as
    | Array<{ content: string; publishDate: string; type?: string }>
    | undefined;

  const apiInfoEnabled = source?.api_info_enabled !== false;
  const apiInfoItems = (apiInfoEnabled ? source?.api_info : []) as
    | ApiInfoItem[]
    | undefined;
  const items = apiInfoItems ?? [];
  const baseUrl = normalizeBaseUrl(items[0]?.url || "");
  const apiExamples = baseUrl ? buildApiExamples(baseUrl) : [];

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : user?.display_name
      ? user.display_name.slice(0, 2).toUpperCase()
      : "U";

  const displayName = user?.display_name || user?.username || "User";
  const roleLabel = getRoleLabel(user?.role ?? 1);

  return (
    <div className="flex h-full flex-col overflow-y-auto no-scrollbar">
      {/* Top: Classic-style profile banner */}
      <div className="shrink-0 px-5 pt-2 pb-3">
        <div className="overflow-hidden rounded-lg border bg-card">
          {/* Profile info */}
          <div className="relative px-5 py-4">
            {/* Simplified: only username */}
            <div className="-mt-4 mb-3">
              <h2 className="text-xl font-bold">{displayName}</h2>
            </div>
            {/* Stats row */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t pt-3">
              <div>
                <p className="text-xs text-muted-foreground">
                  {t("Current Balance")}
                </p>
                <p className="font-mono text-2xl font-bold tabular-nums">
                  {formatQuota(user?.quota ?? 0)}
                </p>
              </div>
              <div className="ml-auto flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {t("Total Usage")}
                  </span>
                  <span className="font-mono text-sm font-semibold tabular-nums">
                    {formatQuota(user?.used_quota ?? 0)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {t("Request Count")}
                  </span>
                  <span className="font-mono text-sm font-semibold tabular-nums">
                    {formatNumber(user?.request_count ?? 0)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {t("User Group")}
                  </span>
                  <span className="text-sm font-semibold">
                    {user?.group || "default"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom row: API Info + Announcements */}
      <div className="min-h-0 flex-1 px-5 pb-3">
        <div className="grid h-full grid-cols-1 gap-5 lg:grid-cols-[4fr_6fr]">
          {/* Left: API Info */}
          <div className="overflow-hidden rounded-lg border border-border/60 bg-card">
            <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">
                {t("portal.page.home.discoverAPI")}
              </h3>
            </div>
            <div
              className="overflow-y-auto p-3 no-scrollbar"
              style={{ maxHeight: "calc(100% - 44px)" }}
            >
              {items.length > 0 ? (
                <div className="space-y-4">
                  {items.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 rounded-lg border border-border/40 bg-muted/20 p-3 transition hover:border-primary/30 hover:bg-muted/40"
                    >
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                        style={{ backgroundColor: `${item.color}20` }}
                      >
                        <Globe
                          className="h-4 w-4"
                          style={{ color: item.color }}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {pickLang(item.description, i18n.language)}
                        </p>
                        <div className="mt-1 flex items-start gap-2">
                          <p className="min-w-0 flex-1 break-all font-mono text-xs text-muted-foreground">
                            {item.url}
                          </p>
                          <CopyButton
                            value={item.url}
                            variant="ghost"
                            size="sm"
                            className="size-7 shrink-0 p-0"
                            iconClassName="size-3.5"
                            tooltip={t("Copy URL")}
                          />
                        </div>
                        {item.route ? (
                          <p className="mt-1 break-all text-xs text-muted-foreground">
                            {pickLang(item.route, i18n.language)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {apiExamples.length > 0 ? (
                    <div className="space-y-3 rounded-lg border border-border/40 bg-muted/10 p-3">
                      <div className="flex items-center gap-2">
                        <Code2 className="h-4 w-4 text-muted-foreground" />
                        <h4 className="text-sm font-semibold">
                          {t(
                            "portal.notice.codeExamples.title",
                            "快速接入代码示例",
                          )}
                        </h4>
                      </div>
                      <div className="space-y-3">
                        {apiExamples.map((example) => (
                          <ApiExampleCard
                            key={example.nameKey}
                            example={example}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {t("portal.page.home.noModels")}
                </p>
              )}
            </div>
          </div>

          {/* Right: Announcements */}
          <div className="overflow-hidden rounded-lg border border-border/60 bg-card">
            <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">
                {t("portal.page.home.latestNotice")}
              </h3>
            </div>
            <div
              className="overflow-y-auto p-4 no-scrollbar"
              style={{ maxHeight: "calc(100% - 44px)" }}
            >
              {announcements && announcements.length > 0 ? (
                <div className="space-y-3">
                  {announcements.map((ann, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-border/40 bg-muted/20 p-4"
                    >
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {ann.content}
                        </ReactMarkdown>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {dayjs(ann.publishDate).format("YYYY-MM-DD HH:mm")}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {t("portal.page.home.noNotice")}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
