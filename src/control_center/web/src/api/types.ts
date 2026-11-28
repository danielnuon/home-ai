/**
 * @file Short names for the API types generated from the server's OpenAPI schema.
 *
 * `schema.d.ts` is generated (`make types`) and never edited by hand. Import types from here so a
 * page reads `Approval`, not `components["schemas"]["Approval"]`.
 */
import type { components } from "./schema";

type Schemas = components["schemas"];

export type Approval = Schemas["Approval"];
export type Alert = Schemas["Alert"];
export type ArkDriveStarted = Schemas["ArkDriveStarted"];
export type DocChangeRequested = Schemas["DocChangeRequested"];
export type DocPage = Schemas["DocPage"];
export type GuideAnswer = Schemas["GuideAnswer"];
export type LibraryAnswer = Schemas["LibraryAnswer"];
export type LibraryOverview = Schemas["LibraryOverview"];
export type LibrarySearchResults = Schemas["LibrarySearchResults"];
export type OfflinePack = Schemas["OfflinePack"];
export type QuickCard = Schemas["QuickCard"];
export type TrashItem = Schemas["TrashItem"];
export type TrashOverview = Schemas["TrashOverview"];
export type BackupsOverview = Schemas["BackupsOverview"];
export type Case = Schemas["Case"];
export type ChatMessage = Schemas["ChatMessage"];
export type ChatLead = Schemas["ChatLead"];
export type ChatThread = Schemas["ChatThread"];
export type Contact = Schemas["Contact"];
export type ConnectionsOverview = Schemas["ConnectionsOverview"];
export type ContactsOverview = Schemas["ContactsOverview"];
export type CriticalDecision = Schemas["CriticalDecision"];
export type Department = Schemas["Employee"]["department"];
export type Directory = Schemas["Directory"];
export type DocsOverview = Schemas["DocsOverview"];
export type Employee = Schemas["Employee"];
export type EmployeeState = Schemas["Employee"]["state"];
export type FinanceOverview = Schemas["FinanceOverview"];
export type ImpactLine = Schemas["ImpactLine"];
export type Intervention = Schemas["Intervention"];
export type Job = Schemas["Job"];
export type LiveTask = Schemas["LiveTask"];
export type MaintenanceOverview = Schemas["MaintenanceOverview"];
export type MemoryZone = Schemas["MemoryZone"];
export type Metric = Schemas["Metric"];
export type ModelsOverview = Schemas["ModelsOverview"];
export type PaidFeature = Schemas["PaidFeature"];
export type PersonalOverview = Schemas["PersonalOverview"];
export type PlatformState = Schemas["PlatformState"];
export type Principal = Schemas["Case"]["principal"];
export type Row = Schemas["Row"];
export type RowGroup = Schemas["RowGroup"];
export type ScheduleOverview = Schemas["ScheduleOverview"];
export type SearchResults = Schemas["SearchResults"];
export type SecurityOverview = Schemas["SecurityOverview"];
export type ServiceRow = Schemas["ServiceRow"];
export type ServicesOverview = Schemas["ServicesOverview"];
export type Setting = Schemas["Setting"];
export type SessionState = LiveTask["session_state"];
export type SettingsIndex = Schemas["SettingsIndex"];
export type SetupStep = Schemas["SetupStep"];
export type SourcedFigure = Schemas["SourcedFigure"];
export type SpendOverview = Schemas["SpendOverview"];
export type Stage = Schemas["Stage"];
export type Status = Schemas["StatusLabel"]["status"];
export type StatusLabel = Schemas["StatusLabel"];
export type StepUpProof = Schemas["StepUpProof"];
export type SystemOverview = Schemas["SystemOverview"];
export type TaskDetail = Schemas["TaskDetail"];
export type Thread = Schemas["Thread"];
export type ThreadsOverview = Schemas["ThreadsOverview"];
export type Tile = Schemas["Tile"];
export type TodayOverview = Schemas["TodayOverview"];
export type TranscriptEntry = Schemas["TranscriptEntry"];
export type Trust = Contact["trust"];
export type VoiceOverview = Schemas["VoiceOverview"];
export type WorkBoard = Schemas["WorkBoard"];
export type WorkItem = Schemas["WorkItem"];
export type WorkItemDetail = Schemas["WorkItemDetail"];
export type Idea = Schemas["Idea"];
export type Product = Schemas["Product"];
export type LeadRef = Schemas["LeadRef"];
export type LifecycleProposal = Schemas["LifecycleProposal"];
export type Priority = Schemas["Idea"]["priority"];
export type DiffFile = Schemas["DiffFile"];
