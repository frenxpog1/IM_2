# Twirly Tails Order Management System (OMS)

A comprehensive Order and Inventory Management System with Role-Based Access Control (RBAC), designed for businesses to manage products, suppliers, and customer orders efficiently.

## 🚀 Features

- **Inventory Management:** Track stock levels, low-stock alerts, and product details.
- **Order Management:** Create and manage customer orders and purchase orders.
- **Supplier Portal:** Dedicated view for suppliers to manage their product catalog and respond to restock requests.
- **Role-Based Access Control (RBAC):** Three distinct roles with specific permissions:
  - **Admin:** Full system access.
  - **Staff:** Manage orders and inventory requests.
  - **Supplier:** Manage own products and restock requests.
- **Analytics Dashboard:** Visual overview of business performance (sales, orders, stock status).
- **Audit Logs:** Track access and login history.

## 🌐 Vercel Deployment (Demo Mode)

This project is configured for **Vercel** via `vercel.json`. Since Vercel is a serverless platform, the PHP backend and MySQL database will not run natively there.

To allow for a functional demo on Vercel, the application includes a **Mock/Demo Mode**:
- **Automatic Detection:** If the site is accessed via a `.vercel.app` domain, it automatically switches to Mock Mode.
- **Simulated Authentication:** You can "log in" using the default credentials. The system will simulate the correct role and permissions (Admin, Staff, or Supplier) using local storage and hardcoded data.
- **Limited Functionality:** While navigation and UI permissions work perfectly, data persistence (creating real orders or updating real inventory) is disabled in this mode.

## 🛠️ Tech Stack

- **Backend:** PHP 8.x
- **Database:** MySQL
- **Frontend:** HTML5, CSS3 (Vanilla), JavaScript (Vanilla)
- **Icons:** Material Icons
- **Charts:** Chart.js

## 📦 Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone <your-repo-url>
    ```
2.  **Database Setup:**
    - Create a database named `oms` in your MySQL server (e.g., via phpMyAdmin).
    - Import `backend/oms.sql` to initialize the core schema.
    - Import `backend/rbac_migration.sql` to set up RBAC tables.
3.  **Configuration:**
    - Update `backend/db.php` with your database credentials (host, user, password).
4.  **Local Access:**
    - Place the project in your web server's root (e.g., `htdocs` for XAMPP).
    - Access via `http://localhost/frenz_v6/`.

## 🔐 Default Accounts

| Role | Username | Password |
| :--- | :--- | :--- |
| **Admin** | `admin` | `admin123` |
| **Staff** | `staff` | `staff123` |
| **Supplier** | `supplier` | `supplier123` |

## 📂 Project Structure

- `backend/`: PHP API endpoints and database logic.
- `js/`: Frontend logic (RBAC, Inventory, Orders).
- `css/`: Styling and layout.
- `index.html`: Entry point (redirects to login).
- `dashboard.html`: Main overview for Admin/Staff.
- `inventory.html`: Inventory management and Supplier view.

## 📝 License

This project is for internal use at Twirly Tails.
