let db = null;

export function initDB() {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }
    // Upgraded to version 4 to include characters store
    const request = indexedDB.open('KitobTestDB', 4);

    request.onerror = (e) => {
      console.error('Database error:', e.target.error);
      reject(e.target.error);
    };

    request.onsuccess = async (e) => {
      db = e.target.result;
      try {
        await seedDatabaseIfNeeded();
        resolve(db);
      } catch (err) {
        console.error("Database seeding failed:", err);
        resolve(db); // Still resolve db even if seeding fails
      }
    };

    request.onupgradeneeded = (e) => {
      const database = e.target.result;

      // Users store
      if (!database.objectStoreNames.contains('users')) {
        const userStore = database.createObjectStore('users', { keyPath: 'id' });
        userStore.createIndex('username', 'username', { unique: true });
      }

      // Results store
      if (!database.objectStoreNames.contains('results')) {
        const resultStore = database.createObjectStore('results', { keyPath: 'id' });
        resultStore.createIndex('userId', 'userId', { unique: false });
        resultStore.createIndex('bookId', 'bookId', { unique: false });
        resultStore.createIndex('completedAt', 'completedAt', { unique: false });
      }

      // Comments store
      if (!database.objectStoreNames.contains('comments')) {
        const commentStore = database.createObjectStore('comments', { keyPath: 'id' });
        commentStore.createIndex('bookId', 'bookId', { unique: false });
        commentStore.createIndex('userId', 'userId', { unique: false });
        commentStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Books store (New in v2)
      if (!database.objectStoreNames.contains('books')) {
        database.createObjectStore('books', { keyPath: 'id' });
      }

      // Questions store (New in v2)
      if (!database.objectStoreNames.contains('questions')) {
        const questionStore = database.createObjectStore('questions', { keyPath: 'id' });
        questionStore.createIndex('bookId', 'bookId', { unique: false });
      }

      // Arena matches store (New in v3)
      if (!database.objectStoreNames.contains('arena_matches')) {
        const arenaStore = database.createObjectStore('arena_matches', { keyPath: 'id' });
        arenaStore.createIndex('userId', 'userId', { unique: false });
        arenaStore.createIndex('completedAt', 'completedAt', { unique: false });
      }

      // Characters store (New in v3 / v4)
      if (!database.objectStoreNames.contains('characters')) {
        database.createObjectStore('characters', { keyPath: 'id' });
      }
    };
  });
}

async function seedDatabaseIfNeeded() {
  const booksCount = await new Promise((resolve) => {
    try {
      const store = getStore('books', 'readonly');
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(0);
    } catch {
      resolve(0);
    }
  });

  const hasAtomOdatlar = await new Promise((resolve) => {
    try {
      const store = getStore('books', 'readonly');
      const req = store.get('atom-odatlar');
      req.onsuccess = () => resolve(!!req.result);
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });

  // Upgraded check: seed if count is less than 50 or if the new trending book is missing
  if (booksCount < 50 || !hasAtomOdatlar) {
    console.log("Seeding/Reseeding database with 50 trending default books and questions...");
    const { books: initialBooks, questions: initialQuestions } = await import('./data.js');

    // Add/overwrite books
    const bookStore = getStore('books', 'readwrite');
    bookStore.clear(); // Clear old books
    for (const b of initialBooks) {
      bookStore.put(b);
    }

    // Add/overwrite questions
    const questionStore = getStore('questions', 'readwrite');
    questionStore.clear(); // Clear old questions
    for (const q of initialQuestions) {
      questionStore.put(q);
    }
    console.log("Seeding completed successfully!");
  }
}

function getStore(storeName, mode = 'readonly') {
  if (!db) throw new Error("Database not initialized. Call initDB first.");
  const transaction = db.transaction(storeName, mode);
  return transaction.objectStore(storeName);
}

// User CRUD
export function addUser(userData) {
  return new Promise((resolve, reject) => {
    try {
      const store = getStore('users', 'readwrite');
      const request = store.add(userData);
      request.onsuccess = () => resolve(userData);
      request.onerror = (e) => {
        if (e.target.error.name === 'ConstraintError') {
          reject(new Error("Ushbu foydalanuvchi nomi band!"));
        } else {
          reject(e.target.error);
        }
      };
    } catch (err) {
      reject(err);
    }
  });
}

export function getUserByUsername(username) {
  return new Promise((resolve, reject) => {
    try {
      const store = getStore('users', 'readonly');
      const index = store.index('username');
      const request = index.get(username);
      request.onsuccess = (e) => resolve(e.target.result || null);
      request.onerror = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
}

export function getUserById(id) {
  return new Promise((resolve, reject) => {
    try {
      const store = getStore('users', 'readonly');
      const request = store.get(id);
      request.onsuccess = (e) => resolve(e.target.result || null);
      request.onerror = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
}

export function updateUser(id, updates) {
  return new Promise(async (resolve, reject) => {
    try {
      const user = await getUserById(id);
      if (!user) {
        reject(new Error("Foydalanuvchi topilmadi"));
        return;
      }
      const updatedUser = { ...user, ...updates };
      const store = getStore('users', 'readwrite');
      const request = store.put(updatedUser);
      request.onsuccess = () => resolve(updatedUser);
      request.onerror = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
}

export function deleteUser(id) {
  return new Promise((resolve, reject) => {
    try {
      const store = getStore('users', 'readwrite');
      const request = store.delete(id);
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
}

export function getAllUsers() {
  return new Promise((resolve, reject) => {
    try {
      const store = getStore('users', 'readonly');
      const request = store.getAll();
      request.onsuccess = (e) => resolve(e.target.result || []);
      request.onerror = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
}

// Dynamic Books CRUD
export function addBook(bookData) {
  return new Promise((resolve, reject) => {
    try {
      const store = getStore('books', 'readwrite');
      const request = store.add(bookData);
      request.onsuccess = () => resolve(bookData);
      request.onerror = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
}

export function updateBook(id, updates) {
  return new Promise(async (resolve, reject) => {
    try {
      const store = getStore('books', 'readwrite');
      const getReq = store.get(id);
      getReq.onsuccess = (e) => {
        const book = e.target.result;
        if (!book) {
          reject(new Error("Kitob topilmadi"));
          return;
        }
        const updated = { ...book, ...updates };
        const putReq = store.put(updated);
        putReq.onsuccess = () => resolve(updated);
        putReq.onerror = (err) => reject(err.target.error);
      };
      getReq.onerror = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
}

export function deleteBook(id) {
  return new Promise((resolve, reject) => {
    try {
      const store = getStore('books', 'readwrite');
      const request = store.delete(id);
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
}

export function getBookById(id) {
  return new Promise((resolve, reject) => {
    try {
      const store = getStore('books', 'readonly');
      const request = store.get(id);
      request.onsuccess = (e) => resolve(e.target.result || null);
      request.onerror = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
}

export function getAllBooks() {
  return new Promise((resolve, reject) => {
    try {
      const store = getStore('books', 'readonly');
      const request = store.getAll();
      request.onsuccess = (e) => resolve(e.target.result || []);
      request.onerror = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
}

// Dynamic Questions CRUD
export function addQuestion(qData) {
  return new Promise((resolve, reject) => {
    try {
      const store = getStore('questions', 'readwrite');
      const request = store.add(qData);
      request.onsuccess = () => resolve(qData);
      request.onerror = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
}

export function updateQuestion(id, updates) {
  return new Promise(async (resolve, reject) => {
    try {
      const store = getStore('questions', 'readwrite');
      const getReq = store.get(id);
      getReq.onsuccess = (e) => {
        const q = e.target.result;
        if (!q) {
          reject(new Error("Savol topilmadi"));
          return;
        }
        const updated = { ...q, ...updates };
        const putReq = store.put(updated);
        putReq.onsuccess = () => resolve(updated);
        putReq.onerror = (err) => reject(err.target.error);
      };
      getReq.onerror = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
}

export function deleteQuestion(id) {
  return new Promise((resolve, reject) => {
    try {
      const store = getStore('questions', 'readwrite');
      const request = store.delete(id);
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
}

export function getQuestionsByBook(bookId) {
  return new Promise((resolve, reject) => {
    try {
      const store = getStore('questions', 'readonly');
      const index = store.index('bookId');
      const request = index.getAll(bookId);
      request.onsuccess = (e) => resolve(e.target.result || []);
      request.onerror = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
}

export function getAllQuestions() {
  return new Promise((resolve, reject) => {
    try {
      const store = getStore('questions', 'readonly');
      const request = store.getAll();
      request.onsuccess = (e) => resolve(e.target.result || []);
      request.onerror = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
}

// Results CRUD
export function addResult(resultData) {
  return new Promise((resolve, reject) => {
    try {
      const store = getStore('results', 'readwrite');
      const request = store.add(resultData);
      request.onsuccess = () => resolve(resultData);
      request.onerror = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
}

export function getResultsByUser(userId) {
  return new Promise((resolve, reject) => {
    try {
      const store = getStore('results', 'readonly');
      const index = store.index('userId');
      const request = index.getAll(userId);
      request.onsuccess = (e) => {
        const results = e.target.result || [];
        results.sort((a, b) => b.completedAt - a.completedAt);
        resolve(results);
      };
      request.onerror = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
}

export function getResultById(id) {
  return new Promise((resolve, reject) => {
    try {
      const store = getStore('results', 'readonly');
      const request = store.get(id);
      request.onsuccess = (e) => resolve(e.target.result || null);
      request.onerror = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
}

export function getAllResults() {
  return new Promise((resolve, reject) => {
    try {
      const store = getStore('results', 'readonly');
      const request = store.getAll();
      request.onsuccess = (e) => {
        const results = e.target.result || [];
        results.sort((a, b) => b.completedAt - a.completedAt);
        resolve(results);
      };
      request.onerror = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
}

// Comments CRUD
export function addComment(commentData) {
  return new Promise((resolve, reject) => {
    try {
      const store = getStore('comments', 'readwrite');
      const request = store.add(commentData);
      request.onsuccess = () => resolve(commentData);
      request.onerror = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
}

export function getCommentsByBook(bookId) {
  return new Promise((resolve, reject) => {
    try {
      const store = getStore('comments', 'readonly');
      const index = store.index('bookId');
      const request = index.getAll(bookId);
      request.onsuccess = (e) => {
        const comments = e.target.result || [];
        comments.sort((a, b) => b.createdAt - a.createdAt);
        resolve(comments);
      };
      request.onerror = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
}

export function getAllComments() {
  return new Promise((resolve, reject) => {
    try {
      const store = getStore('comments', 'readonly');
      const request = store.getAll();
      request.onsuccess = (e) => {
        const comments = e.target.result || [];
        comments.sort((a, b) => b.createdAt - a.createdAt);
        resolve(comments);
      };
      request.onerror = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
}

export function updateComment(id, updates) {
  return new Promise((resolve, reject) => {
    try {
      const store = getStore('comments', 'readwrite');
      const getReq = store.get(id);
      getReq.onsuccess = (e) => {
        const comment = e.target.result;
        if (!comment) {
          reject(new Error("Comment topilmadi"));
          return;
        }
        const updated = { ...comment, ...updates };
        const putReq = store.put(updated);
        putReq.onsuccess = () => resolve(updated);
        putReq.onerror = (err) => reject(err.target.error);
      };
      getReq.onerror = (err) => reject(err.target.error);
    } catch (err) {
      reject(err);
    }
  });
}

export function deleteComment(id) {
  return new Promise((resolve, reject) => {
    try {
      const store = getStore('comments', 'readwrite');
      const request = store.delete(id);
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
}

// Arena Matches CRUD
export function addArenaMatch(matchData) {
  return new Promise((resolve, reject) => {
    try {
      const store = getStore('arena_matches', 'readwrite');
      const request = store.add(matchData);
      request.onsuccess = () => resolve(matchData);
      request.onerror = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
}

export function getArenaMatchesByUser(userId) {
  return new Promise((resolve, reject) => {
    try {
      const store = getStore('arena_matches', 'readonly');
      const index = store.index('userId');
      const request = index.getAll(userId);
      request.onsuccess = (e) => {
        const matches = e.target.result || [];
        matches.sort((a, b) => b.completedAt - a.completedAt);
        resolve(matches);
      };
      request.onerror = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
}

export function getAllArenaMatches() {
  return new Promise((resolve, reject) => {
    try {
      const store = getStore('arena_matches', 'readonly');
      const request = store.getAll();
      request.onsuccess = (e) => {
        const matches = e.target.result || [];
        matches.sort((a, b) => b.completedAt - a.completedAt);
        resolve(matches);
      };
      request.onerror = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
}

// Characters CRUD
export function addCharacter(charData) {
  return new Promise((resolve, reject) => {
    try {
      const store = getStore('characters', 'readwrite');
      const request = store.add(charData);
      request.onsuccess = () => resolve(charData);
      request.onerror = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
}

export function getAllCharacters() {
  return new Promise((resolve, reject) => {
    try {
      const store = getStore('characters', 'readonly');
      const request = store.getAll();
      request.onsuccess = (e) => resolve(e.target.result || []);
      request.onerror = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
}

export function updateCharacter(id, updates) {
  return new Promise(async (resolve, reject) => {
    try {
      const store = getStore('characters', 'readwrite');
      const getReq = store.get(id);
      getReq.onsuccess = (e) => {
        const char = e.target.result;
        if (!char) {
          reject(new Error("Qahramon topilmadi"));
          return;
        }
        const updated = { ...char, ...updates };
        const putReq = store.put(updated);
        putReq.onsuccess = () => resolve(updated);
        putReq.onerror = (err) => reject(err.target.error);
      };
      getReq.onerror = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
}

export function deleteCharacter(id) {
  return new Promise((resolve, reject) => {
    try {
      const store = getStore('characters', 'readwrite');
      const request = store.delete(id);
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
}

// User Streak management
export function updateUserStreak(userId) {
  return new Promise(async (resolve, reject) => {
    try {
      const user = await getUserById(userId);
      if (!user) {
        reject(new Error("Foydalanuvchi topilmadi"));
        return;
      }

      if (!user.stats) {
        user.stats = {
          testsCompleted: 0,
          avgScore: 0,
          bestScore: 0,
          currentStreak: 0,
          maxStreak: 0,
          lastQuizDate: ''
        };
      }

      // Initialize streak properties if they don't exist
      if (user.stats.currentStreak === undefined) user.stats.currentStreak = 0;
      if (user.stats.maxStreak === undefined) user.stats.maxStreak = 0;
      if (user.stats.lastQuizDate === undefined) user.stats.lastQuizDate = '';

      const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
      const lastDate = user.stats.lastQuizDate;

      if (lastDate === today) {
        // Already completed a test today, no need to update streak
        resolve(user);
        return;
      }

      const yesterdayObj = new Date();
      yesterdayObj.setDate(yesterdayObj.getDate() - 1);
      const yesterday = yesterdayObj.toLocaleDateString('en-CA');

      if (lastDate === yesterday) {
        user.stats.currentStreak += 1;
      } else {
        user.stats.currentStreak = 1;
      }

      user.stats.maxStreak = Math.max(user.stats.maxStreak, user.stats.currentStreak);
      user.stats.lastQuizDate = today;

      const updatedUser = await updateUser(userId, { stats: user.stats });
      resolve(updatedUser);
    } catch (err) {
      reject(err);
    }
  });
}

