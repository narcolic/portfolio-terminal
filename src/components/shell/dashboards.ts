export type DashboardItem = {
  title: string;
  path: string | null;
  description: string;
  placeholder?: boolean;
};

export type DashboardCategory = {
  category: string;
  items: DashboardItem[];
};

export const dashboardCategories: DashboardCategory[] = [
  {
    category: "Finance",
    items: [
      {
        title: "Portfolio Tracker",
        path: "/portfolio",
        description: "Stocks & positions",
      },
      {
        title: "Car Service & Expenses",
        path: null,
        description: "Maintenance, fuel, and running costs",
        placeholder: true,
      },
      {
        title: "Energy & Power Bills",
        path: null,
        description: "Bills, usage, and consumption trends",
        placeholder: true,
      },
    ],
  },
];

export const dashboards = dashboardCategories.flatMap((group) => group.items);
