import type { Metadata } from "next";
import { ExploreFrame } from "@/components/common/explore-frame";
import { SettingsView } from "@/components/settings/settings-view";
import { parseScenario } from "@/lib/data";
import { getSettingsData } from "@/lib/data/pages";
import { settle } from "@/lib/data/settle";

export const metadata: Metadata = { title: "Settings" };

const DESCRIPTION = "Read-only server configuration. Secret values appear only as set or not set.";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const scenario = parseScenario((await searchParams).scenario);
  const result = await settle(Promise.resolve().then(() => getSettingsData(scenario)));
  if (!result.ok) {
    return <ExploreFrame title="Settings" description={DESCRIPTION} error={result.error} what="settings" />;
  }
  return (
    <ExploreFrame title="Settings" description={DESCRIPTION} freshness={result.data.freshness} what="settings">
      <SettingsView data={result.data} />
    </ExploreFrame>
  );
}
