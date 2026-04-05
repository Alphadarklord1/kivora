import { pgTable, text, timestamp, uuid, boolean, integer, real, jsonb, primaryKey, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import type { RAGIndex } from '@/lib/rag/retrieve';

// ============ USERS & AUTH ============

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  emailVerified: timestamp('email_verified'),
  image: text('image'),
  bio: text('bio'),
  studyInterests: text('study_interests'),
  supabaseAuthId: text('supabase_auth_id'),
  passwordHash: text('password_hash'),
  isGuest: boolean('is_guest').notNull().default(false),
  guestSessionId: text('guest_session_id'),
  twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
  twoFactorSecret: text('two_factor_secret'),
  twoFactorConfirmedAt: timestamp('two_factor_confirmed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  guestSessionUnique: uniqueIndex('users_guest_session_id_uq').on(table.guestSessionId),
  supabaseAuthUnique: uniqueIndex('users_supabase_auth_id_uq').on(table.supabaseAuthId),
}));

export const accounts = pgTable('accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  refreshToken: text('refresh_token'),
  accessToken: text('access_token'),
  expiresAt: integer('expires_at'),
  tokenType: text('token_type'),
  scope: text('scope'),
  idToken: text('id_token'),
  sessionState: text('session_state'),
}, (table) => ({
  providerAccountIdUnique: uniqueIndex('accounts_provider_provider_account_id_uq').on(table.provider, table.providerAccountId),
  userProviderUnique: uniqueIndex('accounts_user_provider_uq').on(table.userId, table.provider),
}));

export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionToken: text('session_token').notNull().unique(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires').notNull(),
});

export const verificationTokens = pgTable('verification_tokens', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull().unique(),
  expires: timestamp('expires').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.identifier, table.token] }),
}));

// ============ USER SETTINGS ============

export const userSettings = pgTable('user_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  theme: text('theme').default('light').notNull(),
  fontSize: text('font_size').default('1').notNull(),
  lineHeight: text('line_height').default('1.5').notNull(),
  density: text('density').default('normal').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ============ FOLDERS & TOPICS ============

export const folders = pgTable('folders', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), // Encrypted client-side
  nameIndex: text('name_index'), // Blind index for searching encrypted names
  expanded: boolean('expanded').default(true),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const topics = pgTable('topics', {
  id: uuid('id').defaultRandom().primaryKey(),
  folderId: uuid('folder_id').notNull().references(() => folders.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), // Encrypted client-side
  nameIndex: text('name_index'), // Blind index for searching
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ============ FILES (METADATA ONLY) ============

export const files = pgTable('files', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  folderId: uuid('folder_id').notNull().references(() => folders.id, { onDelete: 'cascade' }),
  topicId: uuid('topic_id').references(() => topics.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), // Encrypted client-side
  nameIndex: text('name_index'), // Blind index for searching
  type: text('type').notNull(), // 'upload' | 'pdf' | 'assignment' | 'summarize' | 'mcq' | 'quiz' | 'pop' | 'notes'
  content: text('content'), // Encrypted client-side
  localBlobId: text('local_blob_id'), // Reference to IndexedDB blob
  mimeType: text('mime_type'),
  fileSize: integer('file_size'),
  storageProvider: text('storage_provider'),
  storageBucket: text('storage_bucket'),
  storagePath: text('storage_path'),
  storageUploadedAt: timestamp('storage_uploaded_at'),
  liked: boolean('liked').default(false),
  pinned: boolean('pinned').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ============ LIBRARY ITEMS ============

export const libraryItems = pgTable('library_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  mode: text('mode').notNull(),
  content: text('content').notNull(), // Encrypted client-side
  contentIndex: text('content_index'), // Blind index for searching
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============ RECENT ACCESS TRACKING ============

export const recentFiles = pgTable('recent_files', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  fileId: uuid('file_id').notNull().references(() => files.id, { onDelete: 'cascade' }),
  accessedAt: timestamp('accessed_at').defaultNow().notNull(),
});

// ============ RAG FILE INDEXES ============

export const ragFileIndexes = pgTable('rag_file_indexes', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  fileId: uuid('file_id').notNull().references(() => files.id, { onDelete: 'cascade' }),
  signature: text('signature').notNull(),
  embeddingVersion: text('embedding_version').notNull(),
  chunkCount: integer('chunk_count').notNull().default(0),
  indexData: jsonb('index_data').$type<RAGIndex>().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userFileUnique: uniqueIndex('rag_file_indexes_user_file_uq').on(table.userId, table.fileId),
}));

// ============ SHARING ============

export const shares = pgTable('shares', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  folderId: uuid('folder_id').references(() => folders.id, { onDelete: 'cascade' }),
  topicId: uuid('topic_id').references(() => topics.id, { onDelete: 'cascade' }),
  fileId: uuid('file_id').references(() => files.id, { onDelete: 'cascade' }),
  libraryItemId: uuid('library_item_id').references(() => libraryItems.id, { onDelete: 'cascade' }),
  shareType: text('share_type').notNull(), // 'link' | 'user'
  shareToken: text('share_token').unique(),
  sharedWithUserId: uuid('shared_with_user_id').references(() => users.id, { onDelete: 'cascade' }),
  permission: text('permission').default('view').notNull(), // 'view' | 'edit'
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============ STUDY GROUPS ============

export const studyGroups = pgTable('study_groups', {
  id:          uuid('id').defaultRandom().primaryKey(),
  ownerId:     uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name:        text('name').notNull(),
  description: text('description'),
  joinCode:    text('join_code').notNull().unique(), // 6-char uppercase alphanumeric
  createdAt:   timestamp('created_at').defaultNow().notNull(),
});

export const studyGroupMembers = pgTable('study_group_members', {
  id:       uuid('id').defaultRandom().primaryKey(),
  groupId:  uuid('group_id').notNull().references(() => studyGroups.id, { onDelete: 'cascade' }),
  userId:   uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role:     text('role').notNull().default('member'), // 'owner' | 'member'
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
}, (table) => ({
  groupUserUnique: uniqueIndex('study_group_members_group_user_uq').on(table.groupId, table.userId),
  userIdx: index('study_group_members_user_idx').on(table.userId),
}));

export const studyGroupDecks = pgTable('study_group_decks', {
  id:         uuid('id').defaultRandom().primaryKey(),
  groupId:    uuid('group_id').notNull().references(() => studyGroups.id, { onDelete: 'cascade' }),
  deckName:   text('deck_name').notNull(),
  cardCount:  integer('card_count').notNull().default(0),
  content:    text('content').notNull(), // "Front: X | Back: Y" lines
  shareToken: text('share_token'),       // link to public library entry if published
  addedBy:    uuid('added_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  addedAt:    timestamp('added_at').defaultNow().notNull(),
}, (table) => ({
  groupIdx: index('study_group_decks_group_idx').on(table.groupId),
  addedByIdx: index('study_group_decks_added_by_idx').on(table.addedBy),
}));

// ============ STUDY GROUP NOTES ============

export const studyGroupNotes = pgTable('study_group_notes', {
  id:       uuid('id').defaultRandom().primaryKey(),
  groupId:  uuid('group_id').notNull().references(() => studyGroups.id, { onDelete: 'cascade' }),
  userId:   uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  content:  text('content').notNull(),
  postedAt: timestamp('posted_at').defaultNow().notNull(),
}, (table) => ({
  groupIdx: index('study_group_notes_group_idx').on(table.groupId),
}));

// ============ SAVED SOURCES (Reference Library) ============

export const savedSources = pgTable('saved_sources', {
  id:         uuid('id').defaultRandom().primaryKey(),
  userId:     uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title:      text('title').notNull(),
  url:        text('url').notNull(),
  authors:    text('authors'),          // comma-separated author names
  journal:    text('journal'),          // journal / venue / publisher
  year:       integer('year'),
  doi:        text('doi'),
  abstract:   text('abstract'),
  sourceType: text('source_type'),      // 'pubmed' | 'arxiv' | 'web' | 'doi' | 'manual'
  notes:      text('notes'),
  savedAt:    timestamp('saved_at').defaultNow().notNull(),
}, (table) => ({
  userIdx: index('saved_sources_user_idx').on(table.userId),
}));

// ============ QUIZ ATTEMPTS ============

export const quizAttempts = pgTable('quiz_attempts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  fileId: uuid('file_id').references(() => files.id, { onDelete: 'set null' }),
  deckId: text('deck_id'),
  mode: text('mode').notNull(), // 'mcq' | 'quiz' | 'pop'
  totalQuestions: integer('total_questions').notNull(),
  correctAnswers: integer('correct_answers').notNull(),
  score: integer('score').notNull(), // percentage 0-100
  timeTaken: integer('time_taken'), // seconds
  answers: jsonb('answers'), // Array of { questionId, userAnswer, isCorrect }
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============ RELATIONS ============

export const usersRelations = relations(users, ({ many, one }) => ({
  quizAttempts: many(quizAttempts),
  accounts: many(accounts),
  sessions: many(sessions),
  settings: one(userSettings),
  folders: many(folders),
  files: many(files),
  libraryItems: many(libraryItems),
  shares: many(shares),
  ownedGroups: many(studyGroups),
  groupMemberships: many(studyGroupMembers),
  savedSources: many(savedSources),
}));

export const studyGroupsRelations = relations(studyGroups, ({ one, many }) => ({
  owner: one(users, { fields: [studyGroups.ownerId], references: [users.id] }),
  members: many(studyGroupMembers),
  decks: many(studyGroupDecks),
  notes: many(studyGroupNotes),
}));

export const studyGroupMembersRelations = relations(studyGroupMembers, ({ one }) => ({
  group: one(studyGroups, { fields: [studyGroupMembers.groupId], references: [studyGroups.id] }),
  user: one(users, { fields: [studyGroupMembers.userId], references: [users.id] }),
}));

export const studyGroupDecksRelations = relations(studyGroupDecks, ({ one }) => ({
  group: one(studyGroups, { fields: [studyGroupDecks.groupId], references: [studyGroups.id] }),
  addedByUser: one(users, { fields: [studyGroupDecks.addedBy], references: [users.id] }),
}));

export const studyGroupNotesRelations = relations(studyGroupNotes, ({ one }) => ({
  group: one(studyGroups, { fields: [studyGroupNotes.groupId], references: [studyGroups.id] }),
  author: one(users, { fields: [studyGroupNotes.userId], references: [users.id] }),
}));

export const savedSourcesRelations = relations(savedSources, ({ one }) => ({
  user: one(users, { fields: [savedSources.userId], references: [users.id] }),
}));

export const foldersRelations = relations(folders, ({ one, many }) => ({
  user: one(users, {
    fields: [folders.userId],
    references: [users.id],
  }),
  topics: many(topics),
  files: many(files),
}));

export const topicsRelations = relations(topics, ({ one, many }) => ({
  folder: one(folders, {
    fields: [topics.folderId],
    references: [folders.id],
  }),
  files: many(files),
}));

export const filesRelations = relations(files, ({ one, many }) => ({
  user: one(users, {
    fields: [files.userId],
    references: [users.id],
  }),
  folder: one(folders, {
    fields: [files.folderId],
    references: [folders.id],
  }),
  topic: one(topics, {
    fields: [files.topicId],
    references: [topics.id],
  }),
  quizAttempts: many(quizAttempts),
}));

export const quizAttemptsRelations = relations(quizAttempts, ({ one }) => ({
  user: one(users, {
    fields: [quizAttempts.userId],
    references: [users.id],
  }),
  file: one(files, {
    fields: [quizAttempts.fileId],
    references: [files.id],
  }),
}));

// ============ SRS CLOUD SYNC ============

export const srsDecks = pgTable('srs_decks', {
  id:        text('id').primaryKey(),                                                  // client-generated deck ID
  userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  deckData:  jsonb('deck_data').notNull(),                                              // full SRSDeck JSON blob
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const studySessions = pgTable('study_sessions', {
  id:             uuid('id').defaultRandom().primaryKey(),
  userId:         uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  date:           text('date').notNull(),                                               // YYYY-MM-DD
  cardsReviewed:  integer('cards_reviewed').notNull().default(0),
  minutesStudied: integer('minutes_studied').notNull().default(0),
  createdAt:      timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  userDateUnique: uniqueIndex('study_sessions_user_date_uq').on(t.userId, t.date),
}));

export const srsPreferences = pgTable('srs_preferences', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  dailyGoal: integer('daily_goal').notNull().default(20),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const srsReviewHistory = pgTable('srs_review_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  deckId: text('deck_id').notNull(),
  cardId: text('card_id').notNull(),
  grade: integer('grade').notNull(),
  correct: boolean('correct').notNull().default(false),
  reviewedAt: timestamp('reviewed_at').defaultNow().notNull(),
  nextReview: text('next_review').notNull(),
  interval: integer('interval').notNull().default(1),
  elapsedDays: integer('elapsed_days').notNull().default(0),
  stability: real('stability'),
  difficulty: real('difficulty'),
});

// ============ STUDY PLANS ============

export const studyPlans = pgTable('study_plans', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  examDate: timestamp('exam_date').notNull(),
  dailyMinutes: integer('daily_minutes').notNull().default(60),
  folderId: uuid('folder_id').references(() => folders.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('active'), // 'active' | 'completed' | 'paused'
  topics: jsonb('topics').notNull(), // Array of {name, difficulty, estimatedHours, completed}
  schedule: jsonb('schedule').notNull(), // Generated day-by-day schedule
  progress: integer('progress').notNull().default(0), // 0-100
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const studyPlansRelations = relations(studyPlans, ({ one }) => ({
  user: one(users, {
    fields: [studyPlans.userId],
    references: [users.id],
  }),
  folder: one(folders, {
    fields: [studyPlans.folderId],
    references: [folders.id],
  }),
}));

// ============ CALENDAR EVENTS ============

export const calendarEvents = pgTable('calendar_events', {
  id:          text('id').primaryKey(),          // client-generated, e.g. evt_xxx
  userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title:       text('title').notNull(),
  type:        text('type').notNull(),           // 'study' | 'exam' | 'deadline' | 'class' | 'break' | 'revision'
  date:        text('date').notNull(),           // YYYY-MM-DD
  startTime:   text('start_time').notNull(),     // HH:MM
  endTime:     text('end_time').notNull(),       // HH:MM
  description: text('description'),
  planId:      uuid('plan_id').references(() => studyPlans.id, { onDelete: 'set null' }),
  completed:   boolean('completed').default(false),
  color:       text('color'),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
  updatedAt:   timestamp('updated_at').defaultNow().notNull(),
});
