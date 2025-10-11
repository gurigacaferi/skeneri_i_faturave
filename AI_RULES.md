# Tech Stack and Project Guidelines

This document outlines the core technologies and best practices for developing this application.

## Tech Stack

*   **React (TypeScript):** The primary library for building the user interface, ensuring type safety and robust code.
*   **React Router:** Used for client-side routing, with all main routes defined in `src/App.tsx`.
*   **Project Structure:**
    *   Application pages reside in `src/pages/`.
    *   Reusable UI components are located in `src/components/`.
    *   The main entry point for the application's content is `src/pages/Index.tsx`.
*   **Tailwind CSS:** Utilized for all styling, providing a utility-first approach for responsive and consistent designs.
*   **shadcn/ui & Radix UI:** Pre-built, accessible UI components are available. These components should be imported and used directly. If a modification is needed, create a new component rather than editing the `shadcn/ui` source files.
*   **Lucide React:** The chosen library for all icons within the application.
*   **Supabase:** Serves as the backend, handling authentication, database operations, and serverless Edge Functions.
*   **React Hook Form & Zod:** Used together for efficient form management and schema-based validation.
*   **Sonner:** The library for displaying toast notifications to the user.
*   **date-fns:** For all date formatting and manipulation tasks.
*   **React Dropzone:** Facilitates drag-and-drop file upload functionality.
*   **React Query (@tanstack/react-query):** Manages server state, data fetching, caching, and synchronization.

## Library Usage Rules

*   **React:** Build declarative UI components.
*   **TypeScript:** Always use TypeScript for new and existing code to leverage type checking.
*   **React Router:** Define routes in `src/App.tsx` and use `useNavigate` for programmatic navigation.
*   **Tailwind CSS:** Apply styling exclusively through Tailwind utility classes. Avoid inline styles or separate CSS files unless absolutely necessary for third-party integrations.
*   **shadcn/ui & Radix UI:** Prioritize using these components for UI elements. If a component needs customization beyond its props, create a new component that wraps or extends the `shadcn/ui` component.
*   **lucide-react:** Use icons from this library.
*   **Supabase:** Interact with the database and authentication services via the `supabase` client. Implement business logic that requires server-side execution as Supabase Edge Functions.
*   **react-hook-form & zod:** Use for all forms to ensure robust validation and state management.
*   **sonner:** Use `showSuccess`, `showError`, `showLoading`, and `dismissToast` from `src/utils/toast.ts` for all user notifications.
*   **date-fns:** Use for any date-related operations.
*   **react-dropzone:** Implement for any file upload areas.
*   **@tanstack/react-query:** Manage all asynchronous data fetching and updates.