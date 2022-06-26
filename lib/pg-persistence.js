// const SeedData = require("./seed-data");
// const deepCopy = require("./deep-copy");
// const { sortTodoLists, sortTodos } = require("./sort");
// const nextId = require("./next-id");
// const { Client } = require("pg");
const { dbQuery } = require("./db-query");
const bcrypt = require("bcrypt");


module.exports = class PgPersistence {

  constructor(session) {
    this.username = session.username;
  }

  async authenticate(username, password) {
    const FIND_HASHED_PASSWORD = "SELECT password FROM users WHERE username = $1";

    let result = await dbQuery(FIND_HASHED_PASSWORD, username);
    if(result.rowCount === 0) return false;
    return bcrypt.compare(password, result.rows[0].password);
  }


  async createTodoList(title) {
    const CREATE_TODOLIST = "INSERT INTO todolists (title, username)" +
                            "  VALUES ($1, $2)";

    try {
      let result = await dbQuery(CREATE_TODOLIST, title, this.username);
      return result.rowCount > 0;
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) return false;
      throw error;
    }
  }

  async createTodo(todoListId, title) {
    const CREATE_TODO = "INSERT INTO todos (title, todolist_id, username) VALUES($1, $2, $3)";

    let result = await dbQuery(CREATE_TODO, title, todoListId, this.username);
    return result.rowCount > 0;
  }

  async existsTodoListTitle(title) {
    const FIND_TODOLIST = "SELECT * FROM todolists WHERE title = $1 AND username = $2";

    let result = await dbQuery(FIND_TODOLIST, title, this.username);
    return result.rowCount > 0;
  }

  hasUndoneTodos(todoList) {
    return todoList.todos.some(todo => !todo.done);
  }

  isDoneTodoList(todoList) {
     return todoList.todos.length > 0 && todoList.todos.every(todo => todo.done);
  }

  isUniqueConstraintViolation(error) {
    return /duplicate key value violates unique constraint/.test(String(error));
  }

  async loadTodo(todoListId, todoId) {
    const FIND_TODO = "SELECT * FROM todos WHERE todoList_id = $1 AND id = $2 AND username = $3";

    let result = await dbQuery(FIND_TODO, todoListId, todoId, this.username);
    return result.rows[0];
  }

  async loadTodoList(todoListId) {
    const FIND_TODOLIST = "SELECT * FROM todolists WHERE id = $1 AND username = $2";
    const FIND_TODOS = "SELECT * FROM todos WHERE todolist_id = $1 AND username = $2";

    let resultTodoList = dbQuery(FIND_TODOLIST, todoListId, this.username);
    let resultTodos = dbQuery(FIND_TODOS, todoListId, this.username);
    let resultBoth = await Promise.all([resultTodoList, resultTodos]);
    let todoList = resultBoth[0].rows[0];
    if (!todoList) return undefined;

    todoList.todos = resultBoth[1].rows;
    return todoList;
  }

  async setTodoListTitle(todoListId, title) {
    const SET_TODOLIST_TITLE = "UPDATE todolists SET title = $1 WHERE id = $2 AND username = $3";

    let result = await dbQuery(SET_TODOLIST_TITLE, title, todoListId, this.username);
    return result.rowCount > 0;
  }

  async sortedTodos(todoList) {
    const SORTED_TODOS = "SELECT * FROM todos WHERE todolist_id = $1 AND username = $2 ORDER BY done ASC, lower(title) ASC";

    let result = await dbQuery(SORTED_TODOS, todoList.id, this.username);

    return result.rows;
  }

  async sortedTodoLists() {
    const ALL_TODOLISTS = "SELECT * FROM todolists WHERE username = $1 ORDER BY lower(title) ASC";
    const ALL_TODOS = "SELECT * FROM todos WHERE username = $1";

    let resultTodoLists = dbQuery(ALL_TODOLISTS, this.username);
    let resultTodos = dbQuery(ALL_TODOS, this.username);
    let resultBoth = await Promise.all([resultTodoLists, resultTodos]);

    let allTodoLists = resultBoth[0].rows;
    let allTodos = resultBoth[1].rows;
    if(!allTodoLists || !allTodos) return undefined;

    allTodoLists.forEach(todoList => {
      todoList.todos = allTodos.filter(todo => {
        return todoList.id === todo.todolist_id;
      });
    });
    

    return this._partitionTodoLists(allTodoLists);
  }

  _partitionTodoLists(todoLists) {
    let undone = [];
    let done = [];

    todoLists.forEach(todoList => {
      if (this.isDoneTodoList(todoList)) {
        done.push(todoList);
      } else {
        undone.push(todoList);
      }
    });

    return undone.concat(done);
  }

  _partitionTodos(todos) {
    let undone = [];
    let done = [];

    todos.forEach(todo => {
      if (this.hasUndoneTodos(todos)) {
        done.push(todo);
      } else {
        undone.push(todo);
      }
    })
  }

  async toggleDoneTodo(todoListId, todoId) {
    const TOGGLE_DONE = "UPDATE todos SET done = NOT done" +
                        " WHERE todolist_id = $1 AND id = $2 AND username = $3";
    
    let result = await dbQuery(TOGGLE_DONE, todoListId, todoId, this.username);
    return result.rowCount > 0;
  }

  async deleted(todoListId, todoId) {
    const DELETE_TODO = "DELETE FROM todos WHERE todolist_id = $1 AND id = $2 AND username = $3";

    let result = await dbQuery(DELETE_TODO, todoListId, todoId, this.username);
    return result.rowCount > 0;
  }

  async deleteTodoList(todoListId) {
    const DELETE_TODOLIST = "DELETE FROM todolists WHERE id = $1 AND username = $2";
    let result = await dbQuery(DELETE_TODOLIST, todoListId, this.username);

    return result.rowCount > 0;
  }


    // Mark all todos on the todo list as done. Returns `true` on success,
    // `false` if the todo list doesn't exist. The todo list ID must be numeric.
    async completeAllTodos(todoListId) {
      const COMPLETE_ALL_TODOS = "UPDATE todos SET done = true WHERE todolist_id = $1 AND username = $2";

      let result = await dbQuery(COMPLETE_ALL_TODOS, todoListId, this.username);
      return result.rowCount > 0;

    }

};