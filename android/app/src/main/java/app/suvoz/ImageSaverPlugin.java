package app.suvoz;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

@CapacitorPlugin(
    name = "ImageSaver",
    permissions = {
        @Permission(alias = "storage", strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE })
    }
)
public class ImageSaverPlugin extends Plugin {

    @PluginMethod
    public void saveImage(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q &&
            getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "storagePermissionCallback");
            return;
        }

        saveImageToGallery(call);
    }

    @PermissionCallback
    public void storagePermissionCallback(PluginCall call) {
        if (getPermissionState("storage") != PermissionState.GRANTED) {
            call.reject("Se necesita permiso para guardar la imagen");
            return;
        }

        saveImageToGallery(call);
    }

    private void saveImageToGallery(PluginCall call) {
        String data = call.getString("data");
        String fileName = sanitizeFileName(call.getString("fileName", "su-voz-a-diario.png"));
        String mimeType = call.getString("mimeType", "image/png");
        String album = sanitizeDirectoryName(call.getString("album", "Su Voz a Diario"));

        if (data == null || data.isEmpty()) {
            call.reject("La imagen está vacía");
            return;
        }

        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            Uri uri = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                ? saveWithMediaStore(bytes, fileName, mimeType, album)
                : saveLegacy(bytes, fileName, mimeType, album);

            JSObject result = new JSObject();
            result.put("uri", uri.toString());
            result.put("fileName", fileName);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("No se pudo guardar la imagen: " + error.getLocalizedMessage(), error);
        }
    }

    private Uri saveWithMediaStore(byte[] bytes, String fileName, String mimeType, String album)
        throws Exception {
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
        values.put(MediaStore.Images.Media.MIME_TYPE, mimeType);
        values.put(
            MediaStore.Images.Media.RELATIVE_PATH,
            Environment.DIRECTORY_PICTURES + File.separator + album
        );
        values.put(MediaStore.Images.Media.IS_PENDING, 1);

        Uri uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
        if (uri == null) {
            throw new IllegalStateException("Android no creó el archivo en la galería");
        }

        try {
            writeBytes(resolver.openOutputStream(uri), bytes);
            ContentValues completed = new ContentValues();
            completed.put(MediaStore.Images.Media.IS_PENDING, 0);
            resolver.update(uri, completed, null, null);
            return uri;
        } catch (Exception error) {
            resolver.delete(uri, null, null);
            throw error;
        }
    }

    @SuppressWarnings("deprecation")
    private Uri saveLegacy(byte[] bytes, String fileName, String mimeType, String album)
        throws Exception {
        File pictures = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES);
        File directory = new File(pictures, album);

        if (!directory.exists() && !directory.mkdirs()) {
            throw new IllegalStateException("No se pudo crear la carpeta de imágenes");
        }

        File outputFile = new File(directory, fileName);
        writeBytes(new FileOutputStream(outputFile), bytes);

        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DATA, outputFile.getAbsolutePath());
        values.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
        values.put(MediaStore.Images.Media.MIME_TYPE, mimeType);

        Uri uri = getContext()
            .getContentResolver()
            .insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);

        return uri != null ? uri : Uri.fromFile(outputFile);
    }

    private void writeBytes(OutputStream stream, byte[] bytes) throws Exception {
        if (stream == null) {
            throw new IllegalStateException("Android no abrió el archivo de destino");
        }

        try (OutputStream output = stream) {
            output.write(bytes);
            output.flush();
        }
    }

    private String sanitizeFileName(String value) {
        String sanitized = value.replaceAll("[\\\\/:*?\"<>|]", "-").trim();
        return sanitized.isEmpty() ? "su-voz-a-diario.png" : sanitized;
    }

    private String sanitizeDirectoryName(String value) {
        String sanitized = value.replaceAll("[\\\\/:*?\"<>|]", "-").trim();
        return sanitized.isEmpty() ? "Su Voz a Diario" : sanitized;
    }
}
