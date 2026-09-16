use tauri::{WebviewUrl, WebviewWindowBuilder};

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let url = "https://unified.icomputeranything.com/login"
                .parse()
                .expect("valid ICA Unified production URL");

            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("ICA Unified")
                .inner_size(1440.0, 900.0)
                .min_inner_size(980.0, 680.0)
                .resizable(true)
                .build()?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running ICA Unified desktop");
}
