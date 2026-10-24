export default function manifest() {
  return {
    name: "Programming Haven",
    short_name: "Haven",
    description: "Get vetted. Get hired. AI-powered prep for remote developer screenings.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#070a12",
    theme_color: "#070a12",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
