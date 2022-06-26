const express = require("express");
const morgan = require("morgan");
const flash = require("express-flash");
const session = require("express-session");
const { body, validationResult } = require("express-validator");
// const TodoList = require("./lib/todolist");
// const Todo = require("./lib/todo");
// const { sortTodoLists, sortTodos }= require("./lib/sort");
const PgPersistence = require("./lib/pg-persistence");
const catchError = require("./lib/catch-error");
const store = require("connect-loki");
// const SessionPersistence = require("./lib/session-persistence");

const app = express();
const host = "localhost";
const port = 3001;
const LokiStore = store(session);

app.set("views", "./views");
app.set("view engine", "pug");

app.use(morgan("common"));
app.use(express.static("public"));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  cookie: {
    httpOnly: true,
    maxAge: 31 * 24 * 60 * 60 * 1000, // 31 days in millseconds
    path: "/",
    secure: false,
  },
  name: "launch-school-todos-session-id",
  resave: false,
  saveUninitialized: true,
  secret: "this is not very secure",
  store: new LokiStore({}),
}));

app.use(flash());

// // Set up persistent session data
// app.use((req, res, next) => {
  
//   let todoLists = [];
//   if ("todoLists" in req.session) {
//     req.session.todoLists.forEach(todoList => {
//       todoLists.push(TodoList.makeTodoList(todoList));
//     });
//   }

//   req.session.todoLists = todoLists;
//   next();
// });

app.use((req, res, next) => {
  res.locals.store = new PgPersistence(req.session);
  next();
});


// Extract session info
app.use((req, res, next) => {
  res.locals.username = req.session.username;
  res.locals.signedIn = req.session.signedIn;
  res.locals.flash = req.session.flash;
  delete req.session.flash;
  next();
});

// // Find a todo list with the indicated ID. Returns `undefined` if not found.
// // Note that `todoListId` must be numeric.
// const loadTodoList = (todoListId, todoLists) => {
//   return todoLists.find(todoList => todoList.id === todoListId);
// };

// Find a todo with the indicated ID in the indicated todo list. Returns
// `undefined` if not found. Note that both `todoListId` and `todoId` must be
// numeric.
const loadTodo = (todoListId, todoId, todoLists) => {
  let todoList = this.loadTodoList(todoListId, todoLists);
  if (!todoList) return undefined;

  return todoList.todos.find(todo => todo.id === todoId);
};

const requiresAuthentication = (req, res, next) => {
  if (!res.locals.signedIn) {
    res.redirect(302, "/users/signin");
  } else {
    next();
  }
}

// Redirect start page
app.get("/", (req, res) => {
  res.redirect("/users/signin");
});

// Render the list of todo lists
app.get("/lists", 
requiresAuthentication,
  catchError (async (req, res) => {
  let store = res.locals.store;
  let todoLists = await store.sortedTodoLists();

  let todosInfo = todoLists.map(todoList => ({
    countAllTodos: todoList.todos.length,
    countDoneTodos: todoList.todos.filter(todo => todo.done).length,
    isDone: store.isDoneTodoList(todoList),
  }))

  res.render("lists", {
    todoLists,
    todosInfo,
  });
})
);

// Render new todo list page
app.get("/lists/new", 
  requiresAuthentication,
  (req, res) => {
  res.render("new-list");
});

app.get("/users/signin", (req, res) => {
  req.flash("info", "Please sign in.");
  res.render("signin", {
    flash: req.flash(),
  });

});

app.post("/users/signin", 
catchError(async (req, res) => {
  let username = req.body.username.trim();
  let password = req.body.password;

  let authenticated = await res.locals.store.authenticate(username, password);

  if(!authenticated) {
    req.flash("error", "Invalid credentials.");
    res.render("signin", {
      flash: req.flash(),
      username: req.body.username.trim(),
    })
  } else {
  req.session.username = username;
  req.session.signedIn = true;
  req.flash("success", "Welcome!");
  res.redirect("/lists");
  }
})
);

app.post("/users/signout", (req, res) => {
  delete req.session.username;
  delete req.session.signedIn;
  res.redirect("/users/signin");
})

// Render individual todo list and its todos
app.get("/lists/:todoListId", 
requiresAuthentication,
  catchError(async (req, res) => {
  let todoListId = req.params.todoListId;
  let todoList = await res.locals.store.loadTodoList(+todoListId);
  if (todoList === undefined) throw new Error("Not found.");
   
    todoList.todos = await res.locals.store.sortedTodos(todoList);
    res.render("list", {

      todoList: todoList,
      isDoneTodoList: res.locals.store.isDoneTodoList(todoList),
      hasUndoneTodos: res.locals.store.hasUndoneTodos(todoList),
    });
})
);

// Render edit todo list form
app.get("/lists/:todoListId/edit", 
requiresAuthentication,
catchError(async (req, res, next) => {
  let todoListId = req.params.todoListId;
  let todoList = await res.locals.store.loadTodoList(+todoListId);
  if (!todoList) throw new Error("Not found.");
    res.render("edit-list", { todoList });
  })
);

// Toggle completion status of a todo
app.post("/lists/:todoListId/todos/:todoId/toggle", 
requiresAuthentication,
  catchError(async (req, res) => {
  let { todoListId, todoId } = { ...req.params };
  let toggled = await res.locals.store.toggleDoneTodo(+todoListId, +todoId);
  if (!toggled) throw new Error("Not found.");
    let todo = await res.locals.store.loadTodo(+todoListId, +todoId);
    if (todo.done) {
      req.flash("success", `"${todo.title}" marked as done!`);
    } else {
      req.flash("success", `"${todo.title}" marked as NOT done.`);
    }

    res.redirect(`/lists/${todoListId}`);
  }
)
);

// Delete a todo
app.post("/lists/:todoListId/todos/:todoId/destroy",
requiresAuthentication, 
catchError(async (req, res) => {
  let { todoListId, todoId } = { ...req.params };

  let deleted = await res.locals.store.deleted(+todoListId, +todoId);
  if (!deleted) throw new Error("Not found.");
      req.flash("success", "The todo has been deleted.");
      res.redirect(`/lists/${todoListId}`);


})
);

// Delete todo list
app.post("/lists/:todoListId/destroy", 
requiresAuthentication,
catchError(async (req, res) => {
  let todoListId = req.params.todoListId;

  let deleteTodoList = await res.locals.store.deleteTodoList(+todoListId);
  if (!deleteTodoList) throw new Error("Not found.");
      req.flash("success", "The todo has been deleted.");
      res.redirect(`/lists`);
  })
);

// Mark all todos as done
app.post("/lists/:todoListId/complete_all", 
requiresAuthentication,
  catchError(async (req, res) => {
  let todoListId = req.params.todoListId;
  let allCompleted = await res.locals.store.completeAllTodos(+todoListId);
  if (!allCompleted) throw new Error("Not found.");

    req.flash("success", "All todos have been marked as done.");
    res.redirect(`/lists/${todoListId}`);
  
})
);

// Create a new todo and add it to the specified list
app.post("/lists/:todoListId/todos",
requiresAuthentication,
  [
    body("todoTitle")
      .trim()
      .isLength({ min: 1 })
      .withMessage("The todo title is required.")
      .isLength({ max: 100 })
      .withMessage("Todo title must be between 1 and 100 characters."),
  ],
  catchError(async (req, res, next) => {
    let todoListId = req.params.todoListId;
    
    let todoTitle = req.body.todoTitle;
    
      let errors = validationResult(req);
      if (!errors.isEmpty()) {
        errors.array().forEach(message => req.flash("error", message.msg));

        let todoList = await res.locals.store.loadTodoList(+todoListId);
        if (!todoList) throw new Error("Not found.");
        todoList.todos = await res.locals.store.sortedTodos(todoList);
        res.render("list", {
          flash: req.flash(),
          todoList,
          isDoneTodoList: res.locals.store.isDoneTodoList(todoList),
          hasUndoneTodos: res.locals.store.hasUndoneTodos(todoList),
          todoTitle,
        });
      } else {
        let created = await res.locals.store.createTodo(+todoListId, todoTitle);
        if (!created) throw new Error("Not found.");
          req.flash("success", "The todo has been created.");
          res.redirect(`/lists/${todoListId}`);
        }
      }
  )
  );

// Edit todo list title
app.post("/lists/:todoListId/edit",
requiresAuthentication,
  [
    body("todoListTitle")
    .trim()
    .isLength({ min: 1 })
    .withMessage("The list title is required.")
    .isLength({ max: 100 })
    .withMessage("List title must be between 1 and 100 characters."),
  ],
  catchError(async (req, res, next) => {
    let store = res.locals.store;
    let todoListId = req.params.todoListId;
    let todoListTitle = req.body.todoListTitle;

    const rerenderEditList = async () => {
      let todoList = await store.loadTodoList(+todoListId);
      if (!todoList) throw new Error("Not found.");
        res.render("edit-list", {
          todoListTitle,
          todoList,
          flash: req.flash(),
        });
    };

    try {
    let errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));
      await rerenderEditList();
    } else if (await res.locals.store.existsTodoListTitle(todoListTitle)) {
      req.flash("error", "The list title must be unique.");
      await rerenderEditList();
    } else if (!await res.locals.store.setTodoListTitle(+todoListId,
                                                  todoListTitle)) throw new Error("Not found.");
      req.flash("success", "Todo list updated.");
      res.redirect(`/lists/${todoListId}`);
    } catch (error) {
      if(res.locals.store.isUniqueConstraintViolation(error)) {
        req.flash("error", "The list title is already in use");
        rerenderEditList();
      } else {
        throw error;
      }
    }
  }
  )
);

// Create a new todo list
app.post("/lists",
requiresAuthentication,
  [
    body("todoListTitle")
      .trim()
      .isLength({ min: 1 })
      .withMessage("The list title is required.")
      .isLength({ max: 100 })
      .withMessage("List title must be between 1 and 100 characters."),
  ],
  catchError(async (req, res) => {
    let errors = validationResult(req);
    let todoListTitle = req.body.todoListTitle;

    const rerenderNewList = () => {
        res.render("new-list", {
          todoListTitle,
          flash: req.flash(),
        });
    };

    
    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));
      rerenderNewList();
    } else if (await res.locals.store.existsTodoListTitle(todoListTitle)) {
      req.flash("error", "The list title must be unique.");
      rerenderNewList();
    } else {
      let created = await res.locals.store.createTodoList(todoListTitle);
      if (!created) {
        req.flash("error", "The list title must be unique.");
        rerenderNewList();
      } else {
        req.flash("success", "The todo list has been created.");
        res.redirect("/lists");
      }
    }
  }
  )
);

// Error handler
app.use((err, req, res, _next) => {
  console.log(err); // Writes more extensive information to the console log
  res.status(404).send(err.message);
});

// Listener
app.listen(port, host, () => {
  console.log(`Todos is listening on port ${port} of ${host}!`);
});