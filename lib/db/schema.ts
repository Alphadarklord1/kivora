import { pgTable, text, timestamp, uuid, boolean, integer, jsonb, primaryKey } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============ USERS & AUTH ============

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  emailVerified: timestamp('email_verified'),
  image: text('image'),
  passwordHash: text('password_hash'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

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
});

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

// ============ QUIZ ATTEMPTS ============

export const quizAttempts = pgTable('quiz_attempts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  fileId: uuid('file_id').references(() => files.id, { onDelete: 'set null' }),
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
