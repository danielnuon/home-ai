/**
 * @file Read hooks, one per page resource.
 *
 * The first element of every query key is the resource name the server uses in its `changed`
 * events (see `events.ts`), so an event that names "approvals" refetches exactly the queries whose
 * key starts with "approvals". Nothing here polls: data changes arrive as events (spec 7.13).
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getJson } from "./client";
import type * as T from "./types";

/**
 * Fetches one resource under its query key. With `keep`, switching to a new key keeps showing the
 * last answer until the new one arrives, so the page does not drop to a loading state between
 * two leads or two searches (spec 7.14, continuity).
 */
function useResource<Data>(key: readonly unknown[], path: string, enabled = true, keep = false) {
  return useQuery({
    queryKey: key,
    queryFn: () => getJson<Data>(path),
    enabled,
    placeholderData: keep ? keepPreviousData : undefined,
  });
}

/** Global banners and navigation badges. */
export const usePlatform = () => useResource<T.PlatformState>(["platform"], "/platform");
/** Everything on Today. */
export const useToday = () => useResource<T.TodayOverview>(["today"], "/today");
/** Approval cards. */
export const useApprovals = () => useResource<T.Approval[]>(["approvals"], "/approvals");
/** Critical decision records. */
export const useDecisions = () => useResource<T.CriticalDecision[]>(["decisions"], "/decisions");
/** Running and queued tasks. */
export const useLiveTasks = () => useResource<T.LiveTask[]>(["live"], "/live");
/** One task's transcript; disabled until a task is chosen. */
export const useTaskDetail = (taskId: string | null) =>
  useResource<T.TaskDetail>(["live", taskId], `/live/${taskId ?? ""}`, taskId !== null);
/** The Work board. */
export const useWorkBoard = () => useResource<T.WorkBoard>(["work"], "/work");
/** One work item's page. */
export const useWorkItem = (itemId: string) =>
  useResource<T.WorkItemDetail>(["work", "item", itemId], `/work-items/${itemId}`);
/** The Directory. */
export const useDirectory = () => useResource<T.Directory>(["directory"], "/directory");
/** Personal cases and domains. */
export const usePersonal = () => useResource<T.PersonalOverview>(["personal"], "/personal");
/** Finance for one principal. */
export const useFinance = (principal: T.Principal) =>
  useResource<T.FinanceOverview>(["finance", principal], `/finance/${principal}`, true, true);
/** Contacts and household. */
export const useContacts = () => useResource<T.ContactsOverview>(["contacts"], "/contacts");
/** Setup steps. */
export const useSetup = () => useResource<T.SetupStep[]>(["setup"], "/setup");
/** Every setting and the hard limits. */
export const useSettings = () => useResource<T.SettingsIndex>(["settings"], "/settings");
/** System page. */
export const useSystem = () => useResource<T.SystemOverview>(["system"], "/system");
/** Services page. */
export const useServices = () => useResource<T.ServicesOverview>(["services"], "/services");
/** Models page. */
export const useModels = () => useResource<T.ModelsOverview>(["models"], "/models");
/** Spend page. */
export const useSpend = () => useResource<T.SpendOverview>(["spend"], "/spend");
/** Schedule page. */
export const useSchedule = () => useResource<T.ScheduleOverview>(["schedule"], "/schedule");
/** Security page. */
export const useSecurity = () => useResource<T.SecurityOverview>(["security"], "/security");
/** Backups page. */
export const useBackups = () => useResource<T.BackupsOverview>(["backups"], "/backups");
/** Maintenance page. */
export const useMaintenance = () =>
  useResource<T.MaintenanceOverview>(["maintenance"], "/maintenance");
/** Connections page. */
export const useConnections = () =>
  useResource<T.ConnectionsOverview>(["connections"], "/connections");
/** Voice page. */
export const useVoice = () => useResource<T.VoiceOverview>(["voice"], "/voice");
/** Docs page. */
export const useDocs = () => useResource<T.DocsOverview>(["docs"], "/docs");
/** Chat with a lead: its threads, and one thread's messages (`null` for a new chat). */
export const useChat = (leadId: string, threadId: string | null) =>
  useResource<T.ChatThread>(
    ["chat", leadId, threadId ?? "new"],
    threadId ? `/chat/${leadId}?thread=${encodeURIComponent(threadId)}` : `/chat/${leadId}`,
    true,
    true,
  );
/** One document in the Docs reader. */
export const useDocPage = (docId: string) =>
  useResource<T.DocPage>(["docs", docId], `/docs/${docId}`);
/** Recently deleted items. */
export const useTrash = () => useResource<T.TrashOverview>(["trash"], "/trash");
/** The offline library's page; off until the feature is on. */
export const useLibrary = (enabled: boolean) =>
  useResource<T.LibraryOverview>(["library"], "/library", enabled);
/** Library search; disabled for empty words. */
export const useLibrarySearch = (query: string) =>
  useResource<T.LibrarySearchResults>(
    ["library", "search", query],
    `/library/search?q=${encodeURIComponent(query)}`,
    query.trim() !== "",
    true,
  );
/** Search results; disabled for an empty query. */
export const useSearch = (query: string) =>
  useResource<T.SearchResults>(
    ["search", query],
    `/search?q=${encodeURIComponent(query)}`,
    query.trim() !== "",
  );
