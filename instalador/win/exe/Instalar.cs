using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Text;

// Instalar Reshem Client.exe: lleva dentro el paquete del instalador (el mismo .zip de siempre), lo saca a una carpeta temporal,
// ejecuta instalar-launcher.ps1 (descarga el motor, instala y crea los accesos directos) y borra la carpeta temporal al terminar.
// Los argumentos que reciba se pasan tal cual al script (-NoPause, -NoLaunch, -NoShortcuts, -InstallDir ...), para pruebas.
#if SOLO_MODS
    // Version "solo mods": usa instalar-mods.ps1 (instala Fabric y los mods dentro de .minecraft para el launcher oficial).
#endif
internal static class Instalar
{
    private static int Main(string[] args)
    {
        #if SOLO_MODS
        Console.Title = "Mods de Reshem para Minecraft";
        const string NOMBRE_SCRIPT = "instalar-mods.ps1";
#else
        Console.Title = "Instalador de Reshem Client";
        const string NOMBRE_SCRIPT = "instalar-launcher.ps1";
#endif
        string temporal = Path.Combine(Path.GetTempPath(), "ReshemClient-instalador-" + Guid.NewGuid().ToString("N").Substring(0, 8));
        try
        {
            Directory.CreateDirectory(temporal);
            using (Stream recurso = Assembly.GetExecutingAssembly().GetManifestResourceStream("paquete.zip"))
            using (ZipArchive zip = new ZipArchive(recurso, ZipArchiveMode.Read))
            {
                zip.ExtractToDirectory(temporal);
            }
            string carpeta = temporal;
            string[] hijos = Directory.GetDirectories(temporal);
            if (!File.Exists(Path.Combine(carpeta, NOMBRE_SCRIPT)) && hijos.Length > 0)
            {
                carpeta = hijos[0];
            }
            string script = Path.Combine(carpeta, NOMBRE_SCRIPT);
            if (!File.Exists(script))
            {
                Console.WriteLine("No encuentro los archivos del instalador dentro de este programa.");
                Console.ReadLine();
                return 1;
            }
            StringBuilder argumentos = new StringBuilder("-NoProfile -ExecutionPolicy Bypass -File \"" + script + "\"");
            foreach (string a in args)
            {
                argumentos.Append(' ').Append(a.Contains(" ") ? "\"" + a + "\"" : a);
            }
            ProcessStartInfo inicio = new ProcessStartInfo("powershell.exe", argumentos.ToString());
            inicio.UseShellExecute = false;
            inicio.WorkingDirectory = carpeta;
            using (Process proceso = Process.Start(inicio))
            {
                proceso.WaitForExit();
                return proceso.ExitCode;
            }
        }
        catch (Exception error)
        {
            Console.WriteLine("No pude instalar: " + error.Message);
            Console.WriteLine("Pulsa Enter para cerrar.");
            Console.ReadLine();
            return 1;
        }
        finally
        {
            for (int intento = 0; intento < 5; intento++)
            {
                try { Directory.Delete(temporal, true); break; } catch (Exception) { System.Threading.Thread.Sleep(600); }
            }
        }
    }
}
