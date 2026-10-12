using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Text;

// Instalar Reshem Client.exe: lleva dentro el paquete del instalador (el mismo .zip de siempre), lo saca a una carpeta temporal,
// ejecuta instalar-launcher.ps1 (descarga el motor, instala y crea los accesos directos) y borra la carpeta temporal al terminar.
// Los argumentos que reciba se pasan tal cual al script (-NoPause, -NoLaunch, -NoShortcuts, -InstallDir ...), para pruebas.
internal static class Instalar
{
    private static int Main(string[] args)
    {
        Console.Title = "Instalador de Reshem Client";
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
            if (!File.Exists(Path.Combine(carpeta, "instalar-launcher.ps1")) && hijos.Length > 0)
            {
                carpeta = hijos[0];
            }
            string script = Path.Combine(carpeta, "instalar-launcher.ps1");
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
            try { Directory.Delete(temporal, true); } catch (Exception) { }
        }
    }
}
