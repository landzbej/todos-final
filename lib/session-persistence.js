const SeedData = require("./seed-data");
const deepCopy = require("./deep-copy");
const { sortTodoLists, sortTodos } = require("./sort");
const nextId = require("./next-id");


module.exports = class SessionPersistence {
  constructor(session) {
    this._todoLists = session.todoLists || deepCopy(SeedData);
    session.todoLists = this._todoLists;
  }

  createTodoList(title) {
    this._todoLists.push({
      title,
      id: nextId(),
      todos: [],
    });

    return true;
  }

  createTodo(todoListId, title) {
    let todoList = this._findTodoList(todoListId);
    if (!todoList) return false;

    todoList.todos.push({
      title,
      id: nextId(),
      done: false,
    });

    return true;
  }

  existsTodoListTitle(title) {
    return this._todoLists.some(todoList => todoList.title === title);
  }

  hasUndoneTodos(todoList) {
    return todoList.todos.some(todo => !todo.done);
  }

  isDoneTodoList(todoList) {
    return todoList.todos.length > 0 && todoList.todos.every(todo => todo.done);
  }

  isUniqueConstraintViolation(_error) {
    return false;
  }

  loadTodo(todoListId, todoId) {
    let todo = this._findTodo(todoListId, todoId);
    return deepCopy(todo);
  }

  loadTodoList(todoListId) {
    let todoList = this._findTodoList(todoListId);
    return deepCopy(todoList);
  }

  setTodoListTitle(todoListId, title) {
    let todoList = this._findTodoList(todoListId);
    if (!todoList) return false;

    todoList.title = title;
    return true;
  }

  sortedTodos(todoList) {
    let todos = todoList.todos;
    let undone = todos.filter(todo => !todo.done);
    let done = todos.filter(todo => todo.done);
    return deepCopy(sortTodos(undone, done));
  }

  sortedTodoLists() {
    let todoLists = deepCopy(this._todoLists);
    let undone = todoLists.filter(todoList => !this.isDoneTodoList(todoList));
    let done = todoLists.filter(todoList => this.isDoneTodoList(todoList));
    return sortTodoLists(undone, done);
  }

  toggleDoneTodo(todoListId, todoId) {
    let todo = this._findTodo(todoListId, todoId);
    if (!todo) return false;

    todo.done = !todo.done;
    return true;
  }

  deleted(todoListId, todoList) {
    let todo = this._findTodo(todoListId, todoId);
    if(!todo) return false;

    let todoIndex = todoList.todos.findIndex(todo => todo.id = todoId);
    if (todoIndex === -1) return false;
    
    todoList.todos.splice(todoIndex, 1);
    return true;
  }

  deleteTodoList(todoListId) {
    let todoListIndex = this._todoLists.findIndex(todoList => {return todoList.id === todoListId});
    if (todoListIndex === -1) return false;

    this._todoLists.splice(todoListIndex, 1);
    return true;
  }


    // Mark all todos on the todo list as done. Returns `true` on success,
    // `false` if the todo list doesn't exist. The todo list ID must be numeric.
    completeAllTodos(todoListId) {
      let todoList = this._findTodoList(todoListId);
      if (!todoList) return false;
  
      todoList.todos.filter(todo => !todo.done)
                    .forEach(todo => (todo.done = true));
      return true;
    }

  _findTodoList(todoListId) {
    return this._todoLists.find(todoList => todoList.id === todoListId);
  }

  _findTodo(todoListId, todoId) {
    let todoList = this._findTodoList(todoListId);
    if (!todoList) return undefined;

    return todoList.todos.find(todo => todo.id === todoId);
  }
};