# Library Books API

Base path: `/api/books`

## Endpoints

- **List books**
  - Method: `GET`
  - Path: `/api/books`
  - Description: Returns the collection of books.
  - Success status: `200 OK`

- **Get one book**
  - Method: `GET`
  - Path: `/api/books/{bookId}`
  - Description: Returns the book with the specified ID.
  - Success status: `200 OK`

- **Create a book**
  - Method: `POST`
  - Path: `/api/books`
  - Description: Adds a book to the collection.
  - Example request body:
    ```json
    {
      "title": "The Left Hand of Darkness",
      "author": "Ursula K. Le Guin",
      "publishedYear": 1969
    }
    ```
  - Success status: `201 Created`

- **Update a book**
  - Method: `PUT`
  - Path: `/api/books/{bookId}`
  - Description: Replaces the details of the specified book.
  - Example request body:
    ```json
    {
      "title": "The Left Hand of Darkness",
      "author": "Ursula K. Le Guin",
      "publishedYear": 1969
    }
    ```
  - Success status: `200 OK`

- **Delete a book**
  - Method: `DELETE`
  - Path: `/api/books/{bookId}`
  - Description: Removes the specified book from the collection.
  - Success status: `204 No Content`

- **List books by author**
  - Method: `GET`
  - Path: `/api/books?author={authorName}`
  - Description: Returns books whose author matches the `author` query parameter.
  - Success status: `200 OK`

## Error responses

- `400 Bad Request`: The request body is missing a required field, such as `title` when creating a book.
- `404 Not Found`: The requested book ID does not exist.
