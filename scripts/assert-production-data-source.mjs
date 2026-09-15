import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import {
  PRODUCTION_DATA_SOURCE_ERROR,
  resolveDataSource,
} from "../src/lib/supabase/config.ts";
import {
  INTAKE_LAB_DASHBOARD_STAT_IDS,
  LIVE_ADMIN_EVENT_DASHBOARD_STAT_IDS,
  buildAdminDashboardViewModel,
  getAdminEventHeaderBadgeKey,
  getPublishingBadgeKey,
} from "../src/lib/admin/dashboard-view-model.ts";

const root = join(import.meta.dirname, "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

const MOCK_INTAKE_STATS = [
  { id: "intake", labelKey: "statNewIntake", count: 12, href: "/admin/intake" },
  { id: "ai", labelKey: "statAiReview", count: 5, href: "/admin/review/ai" },
  { id: "ads", labelKey: "statActiveAds", count: 1, href: "/admin/distribution/ads" },
  { id: "publishing", labelKey: "statPublishing", count: 99, href: "/admin/publishing" },
  { id: "published", labelKey: "statPublished", count: 88, href: "/admin/publishing" },
];

const ADMIN_EVENTS = [
  { id: "a", status: "approved" },
  { id: "b", status: "unpublished" },
  { id: "c", status: "published" },
  { id: "d", status: "draft" },
];

test("development getDataSource matrix: unset/mock → mock, supabase → supabase", () => {
  assert.equal(resolveDataSource({ nodeEnv: "development", dataSource: undefined }), "mock");
  assert.equal(resolveDataSource({ nodeEnv: "development", dataSource: "" }), "mock");
  assert.equal(resolveDataSource({ nodeEnv: "development", dataSource: "mock" }), "mock");
  assert.equal(resolveDataSource({ nodeEnv: "development", dataSource: " supabase " }), "supabase");
});

test("test env keeps mock default and explicit mock", () => {
  assert.equal(resolveDataSource({ nodeEnv: "test", dataSource: undefined }), "mock");
  assert.equal(resolveDataSource({ nodeEnv: "test", dataSource: "mock" }), "mock");
  assert.equal(resolveDataSource({ nodeEnv: "test", dataSource: "supabase" }), "supabase");
});

test("production getDataSource rejects unset, mock, and invalid; supabase only", () => {
  assert.throws(
    () => resolveDataSource({ nodeEnv: "production", dataSource: undefined }),
    (error) => error instanceof Error && error.message === PRODUCTION_DATA_SOURCE_ERROR
  );
  assert.throws(
    () => resolveDataSource({ nodeEnv: "production", dataSource: "" }),
    (error) => error instanceof Error && error.message === PRODUCTION_DATA_SOURCE_ERROR
  );
  assert.throws(
    () => resolveDataSource({ nodeEnv: "production", dataSource: "mock" }),
    (error) => error instanceof Error && error.message === PRODUCTION_DATA_SOURCE_ERROR
  );
  assert.throws(
    () => resolveDataSource({ nodeEnv: "production", dataSource: "postgres" }),
    (error) => error instanceof Error && error.message === PRODUCTION_DATA_SOURCE_ERROR
  );
  assert.equal(resolveDataSource({ nodeEnv: "production", dataSource: "supabase" }), "supabase");
});

test("development rejects invalid data source instead of silent mock", () => {
  assert.throws(
    () => resolveDataSource({ nodeEnv: "development", dataSource: "postgres" }),
    /Invalid SUPABASE_DATA_SOURCE/
  );
});

test("dashboard mock source keeps intake KPIs; supabase uses real event counts", () => {
  const mockView = buildAdminDashboardViewModel({
    dataSource: "mock",
    mockIntakeStats: MOCK_INTAKE_STATS,
    adminEvents: ADMIN_EVENTS,
  });
  assert.equal(mockView.badgeKey, "mockPublishingBadge");
  assert.equal(mockView.showMockDataLabel, true);
  assert.ok(mockView.stats.some((stat) => stat.id === "intake"));
  assert.ok(mockView.stats.some((stat) => stat.id === "ads"));
  assert.equal(mockView.stats.find((stat) => stat.id === "publishing")?.count, 99);

  const liveView = buildAdminDashboardViewModel({
    dataSource: "supabase",
    mockIntakeStats: MOCK_INTAKE_STATS,
    adminEvents: ADMIN_EVENTS,
  });
  assert.equal(liveView.badgeKey, "realPublishingBadge");
  assert.equal(liveView.showMockDataLabel, false);
  assert.deepEqual(
    liveView.stats.map((stat) => stat.id),
    [...LIVE_ADMIN_EVENT_DASHBOARD_STAT_IDS]
  );
  assert.equal(liveView.stats.find((stat) => stat.id === "publishing")?.count, 2);
  assert.equal(liveView.stats.find((stat) => stat.id === "published")?.count, 1);
  for (const id of INTAKE_LAB_DASHBOARD_STAT_IDS) {
    assert.equal(
      liveView.stats.some((stat) => stat.id === id),
      false,
      `supabase dashboard must not show intake-lab card ${id}`
    );
  }
});

test("badge keys never use Mock Publishing for supabase source", () => {
  assert.equal(getPublishingBadgeKey("mock"), "mockPublishingBadge");
  assert.equal(getPublishingBadgeKey("supabase"), "realPublishingBadge");
  assert.equal(getAdminEventHeaderBadgeKey("supabase", true), "realPublishingBadge");
  assert.equal(getAdminEventHeaderBadgeKey("supabase", false), "adminEventCatalogBadge");
  assert.equal(getAdminEventHeaderBadgeKey("mock", true), "mockPublishingBadge");
  assert.notEqual(getAdminEventHeaderBadgeKey("supabase", false), "mockPublishingBadge");
});

test("admin UI selects badge by data source instead of hardcoding mock disconnected copy", () => {
  const dashboard = src("src/app/admin/(control)/page.tsx");
  const eventsPage = src("src/app/admin/(control)/events/page.tsx");
  const detail = src("src/components/admin/AdminEventDetailView.tsx");
  const queue = src("src/components/admin/PublishingQueue.tsx");

  assert.match(dashboard, /getAdminDashboardViewModel/);
  assert.match(dashboard, /dashboard\.badgeKey/);
  assert.doesNotMatch(dashboard, /t\("mockPublishingBadge"\)/);

  assert.match(eventsPage, /getPublishingBadgeKey\(getDataSource\(\)\)/);
  assert.doesNotMatch(eventsPage, /adminEventsReadOnlyBadge/);

  assert.match(detail, /getAdminEventHeaderBadgeKey/);
  assert.match(queue, /getPublishingBadgeKey\(getDataSource\(\)\)/);

  for (const body of [dashboard, eventsPage, detail, queue]) {
    assert.doesNotMatch(body, /Public site disconnected/);
  }

  const en = src("messages/admin/en.json");
  const tr = src("messages/admin/tr.json");
  assert.doesNotMatch(en, /Public site disconnected/);
  assert.doesNotMatch(tr, /Public site disconnected/);
  assert.match(en, /"mockPublishingBadge": "Mock Publishing"/);
});

test("public discovery query errors propagate; production path cannot catch-and-mock", () => {
  const discovery = src("src/lib/data/discovery-repository.ts");
  const supabaseEvents = src("src/lib/data/supabase-events.ts");
  assert.match(supabaseEvents, /throw new Error\(`Supabase discovery events fetch failed/);
  assert.doesNotMatch(supabaseEvents, /mockEventsRepository/);
  assert.doesNotMatch(discovery, /catch\s*\(/);
  assert.match(discovery, /Production never uses mock/);
});

test("production sitemap cannot emit mock catalog slugs", () => {
  const sitemap = src("src/app/sitemap.ts");
  assert.match(sitemap, /export const dynamic = "force-dynamic"/);
  assert.match(sitemap, /assertDiscoverySourceAllowed/);
  assert.match(sitemap, /discoveryEventsRepository/);
  assert.doesNotMatch(sitemap, /mockEventsRepository/);
  assert.doesNotMatch(sitemap, /MOCK_EVENTS/);
  assert.doesNotMatch(sitemap, /girne-yaz-konseri/);
  assert.doesNotMatch(sitemap, /Mock by default/);

  assert.throws(
    () => resolveDataSource({ nodeEnv: "production", dataSource: "mock" }),
    (error) => error instanceof Error && error.message === PRODUCTION_DATA_SOURCE_ERROR
  );

  const envExample = src(".env.example");
  assert.match(envExample, /Production:/);
  assert.match(envExample, /fail loud/);
  assert.doesNotMatch(envExample, /^SUPABASE_DATA_SOURCE=mock$/m);
});
