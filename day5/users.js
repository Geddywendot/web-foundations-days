const USERS_URL = "https://jsonplaceholder.typicode.com/users";

const loadButton = document.querySelector("#load-users");
const filterInput = document.querySelector("#filter-input");
const statusText = document.querySelector("#status");
const usersList = document.querySelector("#users-list");

let users = [];
let hasLoadedUsers = false;

function renderUsers(list) {
  usersList.replaceChildren();

  list.forEach((user) => {
    const item = document.createElement("li");
    const name = document.createElement("h2");
    const email = document.createElement("p");
    const city = document.createElement("p");
    const company = document.createElement("p");

    name.textContent = user.name;
    email.textContent = `Email: ${user.email}`;
    city.textContent = `City: ${user.address.city}`;
    company.textContent = `Company: ${user.company.name}`;

    item.append(name, email, city, company);
    usersList.appendChild(item);
  });
}

function filterUsers() {
  const query = filterInput.value.trim().toLowerCase();
  const filteredUsers = users.filter((user) =>
    user.name.toLowerCase().includes(query),
  );

  renderUsers(filteredUsers);

  if (hasLoadedUsers && query && filteredUsers.length === 0) {
    statusText.textContent = "No users match your filter.";
  } else if (hasLoadedUsers && query) {
    statusText.textContent = `Showing ${filteredUsers.length} of ${users.length} users.`;
  } else if (hasLoadedUsers) {
    statusText.textContent = `Loaded ${users.length} users.`;
  }
}

async function loadUsers() {
  statusText.textContent = "Loading users...";
  loadButton.disabled = true;
  users = [];
  hasLoadedUsers = false;
  usersList.replaceChildren();

  try {
    const response = await fetch(USERS_URL);
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    users = await response.json();
    hasLoadedUsers = true;
    filterUsers();

    if (!filterInput.value.trim()) {
      statusText.textContent = `Loaded ${users.length} users.`;
    }
  } catch (error) {
    statusText.textContent = "Could not load users. Please try again.";
    console.error(error);
  } finally {
    loadButton.disabled = false;
  }
}

loadButton.addEventListener("click", loadUsers);
filterInput.addEventListener("input", filterUsers);
