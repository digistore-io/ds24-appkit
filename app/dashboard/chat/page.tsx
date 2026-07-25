import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { Callout } from "@/components/ui/callout";
import { requireActiveUser } from "@/lib/authz";
import { hasPlan } from "@/lib/entitlements/manage";
import {
  chatConfig,
  chatOffReason,
  chatProviderEnvVar,
  isChatEnabled,
} from "@/lib/ai/chat-config";
import { listConversation } from "@/lib/ai/conversation";
import { ChatWindow } from "./ui";

// The assistant.
//
// This page ALWAYS renders — switched off it shows a notice, not a 404 and not
// an error. Two reasons, and the second is the one that bites otherwise:
// somebody who followed a link to it deserves to be told why it is empty, and
// `node run.mjs smoke` calls every page under `app/` and reads a 5xx as a
// broken app. A feature that is not configured yet is not a broken app.
//
// Everything below is resolved on the SERVER and handed to the client
// component as plain values: `isChatEnabled()` and `hasPlan()` read config
// files and the database, and neither belongs in a browser bundle.
export default async function ChatPage() {
  const session = await requireActiveUser();
  const memberId = session.user.id as string;
  const t = await getTranslations("chat");
  const config = chatConfig();

  const header = (
    <PageHeader
      title={t("title", { name: config.name })}
      description={t("subtitle")}
    />
  );

  const offReason = chatOffReason();
  if (!isChatEnabled() && offReason) {
    // The reason is a code from lib/ai/chat-config.ts, translated here — the
    // module has no language, the page does.
    const body = {
      disabledInConfig: t("offDisabledInConfig"),
      // The env var is looked up rather than written into the message: which
      // key is missing depends on which provider her task is bound to, and a
      // sentence naming one company would be wrong for every app that chose
      // another. Same bug the leak guard found inside chat-config.ts.
      noApiKey: t("offNoApiKey", { envVar: chatProviderEnvVar() }),
      brokenConfig: t("offBrokenConfig"),
    }[offReason];

    return (
      <>
        {header}
        <Callout variant="info" title={t("offTitle", { name: config.name })}>
          {body}
        </Callout>
      </>
    );
  }

  // Whether the feature exists is one question; whether THIS person may use it
  // is another. `hasPlan` reads `grants` — the app's own answer to "may this
  // person use this" — never a billing table.
  if (config.requiresPlan && !(await hasPlan(memberId, config.requiresPlan))) {
    return (
      <>
        {header}
        <Callout variant="warning" title={t("noAccessTitle")}>
          {t("noAccessBody")}
        </Callout>
      </>
    );
  }

  const history = await listConversation(memberId);

  return (
    <>
      {header}
      <ChatWindow
        assistantName={config.name}
        avatar={config.avatar}
        initial={history.map((turn) => ({
          id: turn.id,
          role: turn.role,
          content: turn.content,
        }))}
      />
    </>
  );
}
