import java.io.*;
import java.nio.charset.StandardCharsets;
import java.sql.*;
import java.util.Base64;

// Private stdin/stdout bridge. No HTTP server, TCP listener or H2 console.
class H2Store {
    public static void main(String[] args) throws Exception {
        Class.forName("org.h2.Driver");
        String password = System.getenv().getOrDefault("XINLIU_H2_PASSWORD", "");
        try (Connection db = DriverManager.getConnection("jdbc:h2:file:" + args[0] + ";DB_CLOSE_ON_EXIT=FALSE;WRITE_DELAY=0", "sa", password);
             BufferedReader input = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
             PrintWriter output = new PrintWriter(new OutputStreamWriter(System.out, StandardCharsets.UTF_8), true)) {
            try (Statement schema = db.createStatement()) {
                schema.execute("CREATE TABLE IF NOT EXISTS workbench_state (id INTEGER PRIMARY KEY CHECK (id = 1), state_json CLOB NOT NULL, updated_at TIMESTAMP NOT NULL)");
            }
            db.setAutoCommit(false);
            output.println("0\tREADY");
            for (String line; (line = input.readLine()) != null;) {
                String[] fields = line.split("\t", 3);
                String id = fields[0];
                try {
                    if (fields[1].equals("LOAD")) {
                        String json = null;
                        try (PreparedStatement query = db.prepareStatement("SELECT state_json FROM workbench_state WHERE id = 1"); ResultSet rows = query.executeQuery()) {
                            if (rows.next()) json = rows.getString(1);
                        }
                        db.commit();
                        output.println(id + "\tOK\t" + (json == null ? "" : Base64.getEncoder().encodeToString(json.getBytes(StandardCharsets.UTF_8))));
                    } else if (fields[1].equals("SAVE")) {
                        String json = new String(Base64.getDecoder().decode(fields[2]), StandardCharsets.UTF_8);
                        try (PreparedStatement save = db.prepareStatement("MERGE INTO workbench_state (id, state_json, updated_at) KEY (id) VALUES (1, ?, CURRENT_TIMESTAMP)")) {
                            save.setString(1, json);
                            save.executeUpdate();
                        }
                        db.commit();
                        output.println(id + "\tOK");
                    } else if (fields[1].equals("CLOSE")) {
                        db.commit();
                        output.println(id + "\tOK");
                        return;
                    } else throw new IllegalArgumentException("Unknown storage command");
                } catch (Exception error) {
                    db.rollback();
                    output.println(id + "\tERROR");
                }
            }
        }
    }
}
