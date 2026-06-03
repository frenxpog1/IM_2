# Order Management System (OMS)

A comprehensive Order and Inventory Management System with Role-Based Access Control (RBAC), designed to manage products, suppliers, and customer orders efficiently.

## 🔗 Live Demo
**Access the functional prototype here:** [https://im-2-seven.vercel.app/](https://im-2-seven.vercel.app/)

---

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

This project is optimized for **Vercel**. Since Vercel is a serverless platform, the application includes a **Mock/Demo Mode** to ensure a fully functional experience without a live MySQL database:
- **Automatic Detection:** The system detects the Vercel environment and switches to simulated data.
- **Simulated Authentication:** Login using the default credentials to see specific role views.
- **Sample Data:** Pre-populated with inventory, orders, and analytics for demonstration purposes.

## 🔐 Default Accounts (For Demo)

| Role | Username | Password |
| :--- | :--- | :--- |
| **Admin** | `admin` | `admin123` |
| **Staff** | `staff` | `staff123` |
| **Supplier** | `supplier` | `supplier123` |

## 🛠️ Tech Stack

- **Backend:** PHP 8.x (for local environment)
- **Database:** MySQL (for local environment)
- **Frontend:** HTML5, CSS3 (Vanilla), JavaScript (Vanilla)
- **Icons:** Material Icons
- **Charts:** Chart.js

## 📦 Installation & Setup (Local)

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/frenxpog1/IM_2.git
    ```
2.  **Database Setup:**
    - Create a database named `oms` in your MySQL server.
    - Import `backend/oms.sql` and `backend/rbac_migration.sql` to initialize the schema.
3.  **Configuration:**
    - Update `backend/db.php` with your local database credentials.
4.  **Local Access:**
    - Place the project in your web server's root (e.g., `htdocs` for XAMPP).
    - Access via `http://localhost/IM_2/`.

## 📂 Project Structure

- `backend/`: PHP API endpoints and database logic.
- `js/`: Frontend logic (RBAC, Inventory, Orders, Mock Data).
- `css/`: Styling and layout.
- `index.html`: Entry point (redirects to login).
- `dashboard.html`: Main overview for Admin/Staff.
- `inventory.html`: Inventory management and Supplier view.
